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
  win.webContents.on('console-message', (details) => {
    if (details.level === 'error') console.error(`Renderer: ${details.message}`)
  })
  const evaluate = async (code) => {
    try {
      return await win.webContents.executeJavaScript(code)
    } catch (error) {
      throw new Error(`Renderer evaluation failed: ${code}`, { cause: error })
    }
  }
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
    assert.equal(await evaluate('document.querySelector(".app-input").labels[0].textContent'), 'Shared input')
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".app-input")).height'), '30px')
    assert.equal(await evaluate('document.getElementById(document.querySelector(".app-input").getAttribute("aria-describedby")).textContent'), 'Field hint')
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".app-input")).fontSize'), '11px')
    assert.equal(await evaluate('parseFloat(getComputedStyle(document.querySelector(".app-input")).borderTopWidth) > 0'), true)
    await evaluate('document.querySelector("[role=switch]").click()')
    await waitFor('document.querySelector("[role=switch]").getAttribute("aria-checked") === "true"')
    await evaluate('document.querySelector("#open-modal").focus(); document.querySelector("#open-modal").click()')
    await waitFor('document.querySelectorAll("dialog[open]").length === 1')
    assert.equal(await evaluate('document.querySelector("dialog").parentElement === document.body'), true)
    assert.equal(await evaluate('Math.abs(document.querySelector("dialog").getBoundingClientRect().width - innerWidth) < 1'), true)
    assert.equal(await evaluate('document.querySelector("dialog").getAttribute("aria-labelledby") === document.querySelector("dialog h2").id'), true)
    assert.equal(await evaluate('document.querySelector("dialog select").labels[0].textContent'), 'Shared select')
    assert.equal(await evaluate('getComputedStyle(document.querySelector("dialog select")).appearance'), 'auto')
    assert.equal(await evaluate('document.querySelector("dialog option[value=disabled]").disabled'), true)
    await evaluate('document.querySelector("dialog select").value = "b"; document.querySelector("dialog select").dispatchEvent(new Event("change", { bubbles: true }))')
    await waitFor('document.querySelector("#selected-value").textContent === "b"')
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
    await evaluate('document.querySelector("#view-settings").click()')
    const hfInput = `document.querySelector('input[placeholder="https://hf-mirror.com"]')`
    await waitFor(`Boolean(${hfInput})`)
    await evaluate(`const input = ${hfInput}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "https://draft.example.com"); input.dispatchEvent(new Event("input", { bubbles: true }))`)
    await waitFor('document.body.textContent.includes("有未保存的更改")')
    await evaluate('document.querySelector("#toggle-sidebar").click()')
    await waitFor('JSON.parse(document.querySelector("#saved-settings").textContent).sidebarCollapsed')
    assert.equal(await evaluate(`${hfInput}.value`), 'https://draft.example.com')
    await evaluate('Array.from(document.querySelectorAll("button")).find(button => button.textContent.trim() === "恢复默认").click()')
    assert.equal(await evaluate(`${hfInput}.value`), 'https://draft.example.com')
    await evaluate('Array.from(document.querySelectorAll("header button")).find(button => button.textContent.trim() === "保存").click()')
    await waitFor('JSON.parse(document.querySelector("#saved-settings").textContent).hfEndpoint === "https://draft.example.com"')
    assert.equal(await evaluate('JSON.parse(document.querySelector("#saved-settings").textContent).sidebarCollapsed'), true)
    await evaluate('document.querySelector("#view-home").click()')
    await waitFor('Boolean(document.querySelector("[aria-controls=launch-stack]"))')
    assert.equal(await evaluate('document.querySelectorAll("button button").length'), 0)
    const sortButton = `document.querySelector('button[aria-label^="排序："]')`
    await evaluate(`${sortButton}.click()`)
    await waitFor(`${sortButton}.textContent.trim() === "名称"`)
    assert.equal(await evaluate('document.querySelector("[aria-controls=launch-stack]").getAttribute("aria-expanded")'), 'true')
    await evaluate('document.querySelector("[aria-controls=launch-stack]").click()')
    await waitFor('document.querySelector("[aria-controls=launch-stack]").getAttribute("aria-expanded") === "false"')
    console.log('UI checks passed: typography, shared controls, modal focus/top layer, nested Escape, backdrop gesture, settings draft/save, independent task sorting/disclosure')
    app.exit(0)
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
}).catch((error) => {
  console.error(error)
  app.exit(1)
})
