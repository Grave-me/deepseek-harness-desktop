interface StatusView {
  phase: string
  message: string
  errorCode?: string
}

const message = document.querySelector<HTMLElement>('#message')
const details = document.querySelector<HTMLElement>('#details')
const retry = document.querySelector<HTMLButtonElement>('#retry')

function render(status: StatusView): void {
  if (message !== null) message.textContent = status.message
  if (details !== null) {
    details.textContent = status.errorCode === undefined
      ? `状态：${status.phase}`
      : `状态：${status.phase} · 错误代码：${status.errorCode}`
  }
  if (retry !== null) retry.disabled = ['probing', 'starting', 'stopping'].includes(status.phase)
}

document.querySelector('#retry')?.addEventListener('click', () => { void window.desktop.retry() })
document.querySelector('#logs')?.addEventListener('click', () => { void window.desktop.openLogs() })
document.querySelector('#quit')?.addEventListener('click', () => { void window.desktop.quit() })

void window.desktop.getStatus().then(render)
window.desktop.onStatusChanged(render)
