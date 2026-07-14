# Electron MVC Example

Demonstrates `electron-mvc` with:

- `@Module` composition (`AppModule` → `WindowModule` + `FileModule`)
- Field DI (`@Inject`, `@WindowRef`)
- IPC (`@IpcHandle` / `@IpcOn`) and `@AppEvent`
- Global interceptor + exception filter
- Declarative main window

```bash
# from repo root
pnpm install
pnpm build
pnpm dev:example
```
