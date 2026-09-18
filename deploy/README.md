# Desplegar el cerebro en el Mac Mini

`apps/web` va a Vercel. `apps/bicho` va aquí, a una máquina propia, porque quiere
dos cosas que un serverless no da: un proceso vivo durante minutos (estudiar un
libro son cientos de llamadas seguidas) y un disco de verdad (el cerebro entero
es un fichero SQLite).

## Antes de exponer nada

Tres cosas, en este orden. La tercera no es opcional.

1. **Configurar `BICHO_CORS_ORIGINS`** con el dominio real de Vercel. Por
   defecto solo deja pasar `localhost:5173`, que es lo que quieres en casa y no
   lo que quieres en el servidor.

2. **Poner un límite de gasto a la API key de Anthropic.** En cuanto el túnel esté
   arriba, `POST /study` es una manera anónima de gastar tu saldo: no hay
   autenticación, no hay rate limit, y cada documento son hasta 100 llamadas
   secuenciales. El límite de gasto en la consola de Anthropic es la red de
   seguridad que no depende de que aciertes con la autenticación. Ponlo aunque
   pongas también lo demás.

## Autenticación: decidir antes, no después

La web es pública en Vercel, así que **un secreto compartido metido en el
frontend no es autenticación**: se ve abriendo devtools. Opciones reales:

- **Cloudflare Access delante del túnel.** Lo más simple si el bicho es para
  vosotros. Google/GitHub login, cero código, gratis hasta 50 usuarios.
- **Autenticación de verdad por usuario**, si el bicho va a ser público. Implica
  además resolver el cerebro único (hoy todos los visitantes comparten uno, y
  cualquiera puede enseñarle o borrarle cosas — ver `docs/known-issues.md`).
- **Dejarlo abierto con rate limiting**, y confiar en el límite de gasto. Válido
  para una demo, siempre que asumas que alguien puede tirarte el saldo.

## 1. Código y entorno

```bash
git clone --filter=blob:none --sparse \
    git@github.com:chuan-samon-repositories/tamagochi.git ~/tamagochi
cd ~/tamagochi && git sparse-checkout set apps/bicho contract deploy

cd apps/bicho
python3 -m venv .venv && .venv/bin/pip install -e .
cp .env.example .env        # ANTHROPIC_API_KEY dentro. El .env nunca se commitea.
.venv/bin/bicho             # comprobar a mano que arranca antes de daemonizar
```

## 2. launchd

```bash
sudo cp deploy/launchd/com.chuan-samon.bicho.plist /Library/LaunchDaemons/
sudo vim /Library/LaunchDaemons/com.chuan-samon.bicho.plist   # sustituir TU_USUARIO
sudo chown root:wheel /Library/LaunchDaemons/com.chuan-samon.bicho.plist
sudo chmod 644        /Library/LaunchDaemons/com.chuan-samon.bicho.plist

sudo launchctl bootstrap system /Library/LaunchDaemons/com.chuan-samon.bicho.plist
sudo launchctl print system/com.chuan-samon.bicho | head -20   # estado
tail -f ~/Library/Logs/bicho.log
```

Recargar tras un cambio:

```bash
sudo launchctl bootout system/com.chuan-samon.bicho
sudo launchctl bootstrap system /Library/LaunchDaemons/com.chuan-samon.bicho.plist
```

`LaunchDaemon` y no `LaunchAgent` porque un Agent solo arranca con sesión
iniciada: tras un corte de luz el bicho no volvería hasta que alguien hiciera
login.

## 3. Cloudflare Tunnel

HTTPS es obligatorio, no una mejora: la web se sirve por HTTPS desde Vercel y el
navegador bloquea como *mixed content* cualquier `fetch` a `http://`. Y
`server.py` no habla TLS. El túnel resuelve las dos cosas y además no abre
ningún puerto entrante.

```bash
brew install cloudflared
cloudflared tunnel login
cloudflared tunnel create bicho                  # apunta el TUNNEL_ID que imprime
cp deploy/cloudflared/config.example.yml ~/.cloudflared/config.yml
vim ~/.cloudflared/config.yml                    # TUNNEL_ID, usuario, hostname
cloudflared tunnel route dns bicho bicho.TU_DOMINIO.com
cloudflared tunnel run bicho                     # probar en primer plano
sudo cloudflared service install                 # y dejarlo como servicio
```

## 4. Conectar la web

Dos maneras. La segunda es mejor.

**a) CORS.** Ya funciona: el bicho responde al preflight `OPTIONS` y devuelve
`Access-Control-Allow-Origin` para los orígenes de `BICHO_CORS_ORIGINS`. Solo
hay que añadir ahí el dominio de Vercel.

**b) Rewrite en Vercel — recomendada.** El navegador ve un solo origen y el
problema de CORS desaparece en vez de gestionarse. Y es la única que funciona
desde un *preview*: su dominio lleva el nombre de la rama, así que nunca va a
estar en `BICHO_CORS_ORIGINS`.

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://bicho.TU_DOMINIO.com/v1/:path*" }
  ]
}
```

en `apps/web/vercel.json` — hay una plantilla en `apps/web/vercel.json.example`.
La web llama a `/api/ask` y no necesita saber dónde vive el cerebro. Mantén aun
así las cabeceras CORS para el desarrollo local, que sí cruza orígenes
(`:5173` → `:8777`).

Y en *Settings → Environment Variables* de Vercel:

| Entorno | `VITE_BICHO_API` | Por qué |
|---|---|---|
| Preview | `mock` | Lo que mira Arnau en cada commit. Cerebro de mentira, en el navegador: no toca esta máquina y no gasta nada. |
| Production | `live` | El bicho de verdad, por el rewrite de arriba. |

`mock` es además el valor por defecto si la variable no está, para que un
despliegue mal configurado no cueste dinero. Desde cualquier despliegue,
`?api=live` y `?api=mock` mandan sobre la variable y se recuerdan: así se mira
una pantalla contra el cerebro de verdad sin tocar la configuración.

## 4 bis. Un bicho de pruebas en el túnel (opcional)

Si el Mac Mini va a estar arriba de todas formas, un segundo servicio con
`bicho --fake` en otro puerto da un servidor de verdad —HTTP, CORS, códigos de
estado, progreso real— que no gasta un token:

```bash
BICHO_PORT=8778 BICHO_DB=~/.bicho/pruebas.db ~/tamagochi/apps/bicho/.venv/bin/bicho --fake
```

Otro `ingress` en `~/.cloudflared/config.yml` hacia `bicho-test.TU_DOMINIO.com`,
y `VITE_BICHO_API_URL` apuntando ahí en los previews que quieran ejercitar la
red de verdad. **Es un extra, no un requisito**: el mock del navegador no
depende de que esta máquina esté encendida, y esa es justo su gracia.

## 5. Copias

El cerebro pasa a ser un fichero único en una máquina de casa.

```bash
# crontab -e
0 4 * * * /usr/bin/rsync -a ~/.bicho/brain.db ~/Backups/bicho/brain-$(date +\%F).db
```

Que Time Machine cubra `~/.bicho/` sirve igual. Lo que no sirve es nada: hoy no
hay copia.

Y el log tampoco se rota solo: `launchd` no rota nada, así que
`~/Library/Logs/bicho.log` crece hasta llenar el disco. Está en `TODO.md`.

## Lo que este montaje te ahorra

Comparado con desplegar en serverless, no hace falta nada de esto:

- migrar SQLite a Turso o Postgres — `db.py` se queda tal cual
- partir `study.learn()` en pasos por trozo — un hilo puede correr nueve minutos
- sacar `study.PROGRESO` a la base de datos — un `dict` de módulo es correcto
  cuando hay un solo proceso vivo

Y un extra si el Mac Mini es Apple Silicon: `llm.py` ya enruta por prefijo de
modelo, así que el gate —que corre en **cada** pregunta y es pura
clasificación— puede ir en local con Ollama y dejar solo la redacción en la API.
Es una línea del `.env`:

```bash
BICHO_MODEL_GATE=ollama/qwen2.5:7b
```
