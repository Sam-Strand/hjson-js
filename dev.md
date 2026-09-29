# Запуск

## Вариант 1. Node уже стоит на хосте

```bash
pnpm install
pnpm dev --host 0.0.0.0
```

Открыть: http://localhost:5173/examples/hjson-demo.html

## Вариант 2. Node на хост не ставим

Нужно:
- Docker
- VS Code (или Cursor/Windsurf) с расширением
  **Dev Containers** — `ms-vscode-remote.remote-containers`

Шаги:
1. Поднять контейнер:
   ```bash
   docker compose up -d --build
   ```
2. В VS Code: `F1` → **Dev Containers: Attach to Running Container…** →
   выбрать контейнер проекта.
3. В открывшемся окне VS Code — терминал уже **внутри** контейнера:
   ```bash
   pnpm dev --host 0.0.0.0
   ```
   `--host 0.0.0.0` обязателен: без него Vite слушает только
   `127.0.0.1` внутри контейнера, и с хоста не достучаться.
4. VS Code предложит **Forward Port 5173** — согласиться.
   Или открыть вручную: http://localhost:5173/examples/hjson-demo.html
