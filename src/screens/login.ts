// Login Screen

import {
  BoxRenderable,
  TextRenderable,
  InputRenderable,
  InputRenderableEvents,
  ASCIIFontRenderable,
  TextAttributes,
  type RenderContext,
  type KeyEvent,
} from "@opentui/core"
import { JellyfinClient, type AuthResult } from "../api/jellyfin"
import { theme } from "../utils/theme"
import { strings } from "../utils/strings"
import { debug } from "../utils/debug"

export interface LoginScreenResult {
  client: JellyfinClient
  auth: AuthResult
}

export class LoginScreen {
  private renderer: RenderContext
  private container: BoxRenderable
  private serverInput: InputRenderable
  private usernameInput: InputRenderable
  private passwordInput: InputRenderable
  private statusText: TextRenderable
  private focusIndex = 0
  private inputs: InputRenderable[] = []
  private onLogin: (result: LoginScreenResult) => void
  private keyHandler: (key: KeyEvent) => void
  private submitting = false

  constructor(
    renderer: RenderContext,
    onLogin: (result: LoginScreenResult) => void,
    prefill?: { serverUrl?: string }
  ) {
    this.renderer = renderer
    this.onLogin = onLogin

    debug("login", "LoginScreen created", { prefillServerUrl: prefill?.serverUrl })

    // Main container — centered
    this.container = new BoxRenderable(renderer, {
      id: "login-screen",
      width: "100%",
      height: "100%",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
    })

    // Title
    const title = new ASCIIFontRenderable(renderer, {
      id: "login-title",
      text: strings.app.name,
      font: "tiny",
      color: theme.accent,
    })

    const subtitle = new TextRenderable(renderer, {
      id: "login-subtitle",
      content: strings.login.subtitle,
      attributes: TextAttributes.DIM,
    })

    // Form box
    const formBox = new BoxRenderable(renderer, {
      id: "login-form",
      flexDirection: "column",
      border: true,
      borderStyle: "rounded",
      borderColor: theme.border.normal,
      padding: 2,
      gap: 1,
      width: 50,
      marginTop: 1,
    })

    // Server URL
    const serverRow = this.createFieldRow(renderer, "server-row", strings.login.serverUrl)
    this.serverInput = this.createInput(renderer, "server-input", strings.login.placeholder.serverUrl, prefill?.serverUrl)
    serverRow.add(this.serverInput)

    // Username
    const userRow = this.createFieldRow(renderer, "user-row", strings.login.username + "  ")
    this.usernameInput = this.createInput(renderer, "user-input", strings.login.placeholder.username)
    userRow.add(this.usernameInput)

    // Password
    const passRow = this.createFieldRow(renderer, "pass-row", strings.login.password + "  ")
    this.passwordInput = this.createInput(renderer, "pass-input", strings.login.placeholder.password)
    passRow.add(this.passwordInput)

    // Track input changes for debugging
    this.serverInput.on(InputRenderableEvents.CHANGE, (val: string) => {
      debug("login", `serverInput changed: "${val}"`)
    })
    this.usernameInput.on(InputRenderableEvents.CHANGE, (val: string) => {
      debug("login", `usernameInput changed: "${val}"`)
    })
    this.passwordInput.on(InputRenderableEvents.CHANGE, (val: string) => {
      debug("login", `passwordInput changed: "${val}"`)
    })

    // Listen for Enter on each input (Input consumes Enter key and emits its own event)
    this.serverInput.on(InputRenderableEvents.ENTER, () => {
      debug("login", "Enter on serverInput")
      this.handleSubmit()
    })
    this.usernameInput.on(InputRenderableEvents.ENTER, () => {
      debug("login", "Enter on usernameInput")
      this.handleSubmit()
    })
    this.passwordInput.on(InputRenderableEvents.ENTER, () => {
      debug("login", "Enter on passwordInput")
      this.handleSubmit()
    })

    // Status
    this.statusText = new TextRenderable(renderer, {
      id: "login-status",
      content: "",
      fg: theme.status.error,
    })

    // Hint
    const hint = new TextRenderable(renderer, {
      id: "login-hint",
      content: strings.login.hint,
      attributes: TextAttributes.DIM,
      fg: theme.text.muted,
    })

    // Assemble
    formBox.add(serverRow)
    formBox.add(userRow)
    formBox.add(passRow)
    formBox.add(this.statusText)

    this.container.add(title)
    this.container.add(subtitle)
    this.container.add(formBox)
    this.container.add(hint)

    this.inputs = [this.serverInput, this.usernameInput, this.passwordInput]
    this.focusCurrentInput()

    // Keyboard handler
    this.keyHandler = (key: KeyEvent) => {
      debug("login", `Key received: name=${key.name} ctrl=${key.ctrl} shift=${key.shift} type=${key.eventType}`)

      if (key.name === "tab") {
        if (key.shift) {
          this.focusIndex = (this.focusIndex - 1 + this.inputs.length) % this.inputs.length
        } else {
          this.focusIndex = (this.focusIndex + 1) % this.inputs.length
        }
        debug("login", `Focus changed to index ${this.focusIndex}`)
        this.focusCurrentInput()
      } else if (key.name === "enter" || key.name === "return") {
        // Enter is handled by InputRenderableEvents.ENTER on each input
        // This is a fallback in case no input is focused
        debug("login", "Enter pressed (global handler, fallback)")
        this.handleSubmit()
      }
    }
    renderer.keyInput.on("keypress", this.keyHandler)
    debug("login", "Keypress handler registered")
  }

  private createFieldRow(renderer: RenderContext, id: string, label: string): BoxRenderable {
    const row = new BoxRenderable(renderer, {
      id,
      flexDirection: "row",
      gap: 1,
      alignItems: "center",
    })
    const labelText = new TextRenderable(renderer, {
      id: `${id}-label`,
      content: label,
      fg: theme.text.primary,
      width: 12,
    })
    row.add(labelText)
    return row
  }

  private createInput(renderer: RenderContext, id: string, placeholder: string, value?: string): InputRenderable {
    return new InputRenderable(renderer, {
      id,
      width: 30,
      placeholder,
      value: value ?? "",
      backgroundColor: theme.input.bg,
      textColor: theme.input.text,
      cursorColor: theme.input.cursor,
      focusedBackgroundColor: theme.input.focusedBg,
    })
  }

  private focusCurrentInput() {
    for (const input of this.inputs) {
      input.blur()
    }
    this.inputs[this.focusIndex]?.focus()
    debug("login", `Focused input index ${this.focusIndex}`)
  }

  private async handleSubmit() {
    if (this.submitting) {
      debug("login", "Already submitting, ignoring")
      return
    }

    const serverUrl = this.serverInput.value.trim()
    const username = this.usernameInput.value.trim()
    const password = this.passwordInput.value.trim()

    debug("login", "handleSubmit called", {
      serverUrl,
      username,
      passwordLength: password.length,
    })

    if (!serverUrl) {
      debug("login", "Validation failed: no server URL")
      this.statusText.content = strings.login.error.serverRequired
      this.statusText.fg = theme.status.error
      return
    }
    if (!username) {
      debug("login", "Validation failed: no username")
      this.statusText.content = strings.login.error.usernameRequired
      this.statusText.fg = theme.status.error
      return
    }

    this.submitting = true
    this.statusText.content = strings.login.connecting
    this.statusText.fg = theme.status.success
    debug("login", "Attempting authentication...")

    try {
      const client = new JellyfinClient({ serverUrl })
      const auth = await client.authenticate(username, password)

      debug("login", "Authentication successful", {
        userId: auth.userId,
        username: auth.username,
        serverId: auth.serverId,
      })

      this.statusText.content = strings.login.welcome(auth.username)
      this.statusText.fg = theme.status.success

      // Small delay so user sees the success message
      setTimeout(() => {
        debug("login", "Calling onLogin callback")
        this.onLogin({ client, auth })
      }, 500)
    } catch (err) {
      this.submitting = false
      const msg = err instanceof Error ? err.message : "Connection failed"
      debug("login", "Authentication failed", { error: msg })
      this.statusText.content = strings.login.error.connectionFailed(msg)
      this.statusText.fg = theme.status.error
    }
  }

  getRenderable(): BoxRenderable {
    return this.container
  }

  destroy() {
    debug("login", "LoginScreen destroyed")
    this.renderer.keyInput.off("keypress", this.keyHandler)
    this.container.destroy()
  }
}
