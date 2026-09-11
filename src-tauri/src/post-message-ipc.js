;(function () {
  const invokeKey = __INVOKE_KEY__
  const serializeToIpcKey = '__TAURI_TO_IPC_KEY__'

  function replacer(_key, value) {
    if (value instanceof Map) {
      return Object.fromEntries(value.entries())
    }
    if (value instanceof Uint8Array) {
      return Array.from(value)
    }
    if (value instanceof ArrayBuffer) {
      return Array.from(new Uint8Array(value))
    }
    if (
      typeof value === 'object'
      && value !== null
      && serializeToIpcKey in value
    ) {
      return value[serializeToIpcKey]()
    }
    return value
  }

  function sendIpcMessage(message) {
    const data = JSON.stringify({
      cmd: message.cmd,
      callback: message.callback,
      error: message.error,
      payload: message.payload,
      options: {
        ...(message.options || {}),
        customProtocolIpcBlocked: true
      },
      __TAURI_INVOKE_KEY__: invokeKey
    }, replacer)

    window.ipc.postMessage(data)
  }

  Object.defineProperty(window.__TAURI_INTERNALS__, 'postMessage', {
    value: sendIpcMessage
  })
})()
