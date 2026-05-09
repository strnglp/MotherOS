export function createWSClient(options = {}) {
  const { onMessage, onOpen, onClose, reconnectDelay = 2000 } = options;

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${protocol}//${window.location.host}`;

  let ws = null;
  let shouldReconnect = true;
  let reconnectTimer = null;

  function connect() {
    ws = new WebSocket(url);

    ws.addEventListener("open", () => {
      onOpen?.();
    });

    ws.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data);
        onMessage?.(msg);
      } catch {
        // ignore malformed messages
      }
    });

    ws.addEventListener("close", () => {
      onClose?.();
      if (shouldReconnect) {
        reconnectTimer = setTimeout(connect, reconnectDelay);
      }
    });

    ws.addEventListener("error", () => {
      ws.close();
    });
  }

  connect();

  return {
    send(msg) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    },
    close() {
      shouldReconnect = false;
      clearTimeout(reconnectTimer);
      ws?.close();
    },
  };
}
