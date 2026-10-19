const { createRequire } = require('node:module')
const { join } = require('node:path')
const assert = require('node:assert/strict')
const desktopRequire = createRequire(join(__dirname, '../apps/desktop/package.json'))
const { app, BrowserWindow } = desktopRequire('electron')
const output = process.argv[2]

app.setPath('userData', join(output, 'profile'))
app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 960, height: 640 })
  const evaluate = (code) => win.webContents.executeJavaScript(code)
  const waitFor = async (code) => {
    const deadline = Date.now() + 5000
    while (!(await evaluate(code))) {
      if (Date.now() > deadline) throw new Error(`Timed out: ${code}`)
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }
  const key = async (keyCode, modifiers = []) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
    await new Promise((resolve) => setTimeout(resolve, 30))
  }
  try {
    await win.loadFile(join(output, 'index.html'))
    await waitFor('Boolean(document.querySelector("#open-modal"))')
    assert.equal(await evaluate('getComputedStyle(document.querySelector("#typography")).fontSize'), '10.5px')
    assert.equal(await evaluate('getComputedStyle(document.querySelector("#button-typography")).fontSize'), '11px')
    assert.equal(await evaluate('getComputedStyle(document.querySelector("#button-typography")).fontWeight'), '500')
    await evaluate('document.querySelector("#open-modal").focus(); document.querySelector("#open-modal").click()')
    await waitFor('document.querySelectorAll("dialog[open]").length === 1')
    assert.equal(await evaluate('document.querySelector("dialog").parentElement === document.body'), true)
    assert.equal(await evaluate('Math.abs(document.querySelector("dialog").getBoundingClientRect().width - innerWidth) < 1'), true)
    assert.equal(await evaluate('document.querySelector("dialog").getAttribute("aria-labelledby") === document.querySelector("dialog h2").id'), true)
    await evaluate('document.querySelector("#outside").focus()')
    assert.equal(await evaluate('document.querySelector("dialog").contains(document.activeElement)'), true)
    for (const modifiers of [[], ['shift']]) {
      for (let i = 0; i < 6; i++) {
        await key('Tab', modifiers)
        assert.equal(await evaluate('document.querySelector("dialog").contains(document.activeElement)'), true)
      }
    }
    await evaluate('document.querySelector("#open-sheet").focus(); document.querySelector("#open-sheet").click()')
    await waitFor('document.querySelectorAll("dialog[open]").length === 2')
    await key('Escape')
    await waitFor('document.querySelectorAll("dialog[open]").length === 1')
    assert.equal(await evaluate('document.activeElement.id'), 'open-sheet')
    await key('Escape')
    await waitFor('!document.querySelector("dialog[open]")')
    assert.equal(await evaluate('document.activeElement.id'), 'open-modal')
    await evaluate('document.querySelector("#open-modal").click()')
    await waitFor('Boolean(document.querySelector("dialog[open]"))')
    await evaluate('document.querySelector("#inside").dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); document.querySelector("dialog").click()')
    assert.equal(await evaluate('Boolean(document.querySelector("dialog[open]"))'), true)
    await evaluate('const dialog = document.querySelector("dialog"); dialog.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); dialog.click()')
    await waitFor('!document.querySelector("dialog[open]")')
    console.log('UI checks passed: typography, modal top layer, focus containment/restoration, nested Escape, backdrop gesture')
    app.exit(0)
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
}).catch((error) => {
  console.error(error)
  app.exit(1)
})
