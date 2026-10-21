import { homedir } from 'node:os'
import { join } from 'node:path'
import type { TrainingHost } from '@shared/types'
import { run, runStream, type RunResult } from '../lib/run'

export function posixQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function expandHome(value: string): string {
  if (value === '~') return homedir()
  if (value.startsWith('~/')) return join(homedir(), value.slice(2))
  return value
}

export function targetOf(host: TrainingHost): string {
  if (!host.host || !host.user) throw new Error('SSH host 配置不完整')
  return `${host.user}@${host.host}`
}

function commonArgs(host: TrainingHost): string[] {
  if (host.kind !== 'ssh' || !host.host || !host.user) throw new Error('不是有效的 SSH 主机')
  const args = [
    '-o',
    'BatchMode=yes',
    '-o',
    'StrictHostKeyChecking=yes',
    '-o',
    'ConnectTimeout=12',
    '-o',
    'ServerAliveInterval=15',
    '-o',
    'ServerAliveCountMax=3',
  ]
  if (host.port) args.push('-p', String(host.port))
  if (host.identityFile) args.push('-i', expandHome(host.identityFile))
  return args
}

export function sshArgs(host: TrainingHost, command: string): string[] {
  return [...commonArgs(host), targetOf(host), `bash -lc ${posixQuote(command)}`]
}

/** Quote/lifecycle wrapper for a long-running remote process started over SSH. */
export function sshTunnelArgs(host: TrainingHost, localPort: number, remotePort: number): string[] {
  return [
    ...commonArgs(host),
    '-N',
    '-L',
    `127.0.0.1:${localPort}:127.0.0.1:${remotePort}`,
    targetOf(host),
  ]
}

export function sshCommand(): string {
  return process.env['CLOVER_SSH_BIN'] || 'ssh'
}

export function scpCommand(): string {
  return process.env['CLOVER_SCP_BIN'] || 'scp'
}

export function scpArgs(host: TrainingHost, remotePath: string, localPath: string): string[] {
  if (host.kind !== 'ssh' || !host.host || !host.user) throw new Error('不是有效的 SSH 训练主机')
  const args = [
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=yes',
    '-o', 'ConnectTimeout=12',
  ]
  if (host.port) args.push('-P', String(host.port))
  if (host.identityFile) args.push('-i', expandHome(host.identityFile))
  // Legacy SCP runs the remote path through a shell; SFTP also accepts escaped spaces.
  args.push(`${targetOf(host)}:${remotePath.replace(/ /g, '\\ ')}`, localPath)
  return args
}

export async function scpFrom(host: TrainingHost, remotePath: string, localPath: string, timeoutMs = 180_000): Promise<RunResult> {
  return run(scpCommand(), scpArgs(host, remotePath, localPath), { timeoutMs })
}

export async function remoteAbsolute(host: TrainingHost, path: string): Promise<string> {
  if (!path.startsWith('~/')) return path
  const home = await sshExec(host, 'printf %s "$HOME"', 15_000)
  if (home.code !== 0) throw new Error(home.stderr.trim() || '无法读取远端 HOME')
  return `${home.stdout.trim()}/${path.slice(2)}`
}

export async function sshExec(host: TrainingHost, command: string, timeoutMs = 60_000): Promise<RunResult> {
  return run(sshCommand(), sshArgs(host, command), { timeoutMs })
}

export async function sshStream(
  host: TrainingHost,
  command: string,
  timeoutMs: number,
  onLine: (line: string, stream: 'stdout' | 'stderr') => void,
): Promise<RunResult> {
  return runStream(sshCommand(), sshArgs(host, command), { timeoutMs }, onLine)
}

export async function remotePathExists(host: TrainingHost, path: string, timeoutMs = 15_000): Promise<boolean> {
  const result = await sshExec(host, `test -d ${posixQuote(path)} && echo yes || echo no`, timeoutMs)
  return result.stdout.trim().endsWith('yes')
}

export async function remoteFreePort(host: TrainingHost): Promise<number> {
  const code =
    'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()'
  const result = await sshExec(host, `python3 -c ${posixQuote(code)}`, 15_000)
  const port = Number.parseInt(result.stdout.trim().split('\n').pop() ?? '', 10)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`无法在远端分配端口：${(result.stderr || result.stdout).trim().slice(-500)}`)
  }
  return port
}

export interface RemoteProbe {
  os: string
  gpu: string
  git: string
  uv: string
  python: string
  rootReady: boolean
  raw: string
}

function section(output: string, name: string): string {
  const match = output.match(new RegExp(`@@${name}@@([\\s\\S]*?)(?=@@[A-Z_]+@@|$)`))
  return (match?.[1] ?? '').trim()
}

export async function probeHost(host: TrainingHost): Promise<RemoteProbe> {
  const root = host.trainerRoot
  const command = [
    'printf "@@OS@@"',
    'uname -s -m 2>/dev/null || true',
    'printf "@@GPU@@"',
    'nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null || true',
    'printf "@@GIT@@"',
    'git --version 2>/dev/null || true',
    'printf "@@UV@@"',
    'command -v uv 2>/dev/null || true',
    'printf "@@PY@@"',
    '(python3 --version 2>&1 || python --version 2>&1) || true',
    'printf "@@ROOT@@"',
    `test -d ${posixQuote(root)} && echo yes || echo no`,
  ].join('\n')
  const result = await sshExec(host, command, 30_000)
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `ssh 退出码 ${result.code}`)
  }
  return {
    os: section(result.stdout, 'OS'),
    gpu: section(result.stdout, 'GPU'),
    git: section(result.stdout, 'GIT'),
    uv: section(result.stdout, 'UV'),
    python: section(result.stdout, 'PY'),
    rootReady: section(result.stdout, 'ROOT') === 'yes',
    raw: result.stdout,
  }
}
