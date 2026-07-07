# Notificaciones push (gastos de hoy y mañana)

La app puede mandarte una notificación **un día antes** y **el mismo día** de tus gastos con
fecha, directo a tu iPhone, aunque la app esté cerrada. Requiere iOS 16.4+ y la app **instalada
en la pantalla de inicio**.

Cómo funciona: la app registra tu "suscripción push" en Supabase; una **Edge Function** (`notify`)
corre cada hora (cron) y, a tu hora elegida, te envía los gastos de hoy/mañana.

Necesitas hacer esto **una vez**. Todo el código ya está; aquí solo lo conectas.

---

## 1) Genera las llaves VAPID

En tu compu:

```bash
npx web-push generate-vapid-keys
```

Te da una **Public Key** y una **Private Key**. Guárdalas.

## 2) Llave pública → build (GitHub)

En tu repo → **Settings → Secrets and variables → Actions → New repository secret**:

- `VITE_VAPID_PUBLIC_KEY` = la **Public Key**

(Para probar en local, ponla también en tu `.env`.)

## 3) Crea la tabla en Supabase

Supabase → **SQL Editor** → pega y corre el contenido de [`supabase/notifications.sql`](supabase/notifications.sql)
(solo la parte de `create table` y las `policy`; el bloque del cron va en el paso 6).

## 4) Secrets de la función

Con el [CLI de Supabase](https://supabase.com/docs/guides/cli) (o Dashboard → Edge Functions → Secrets):

```bash
supabase login
supabase link --project-ref <TU-REF>

supabase secrets set \
  VAPID_PUBLIC_KEY="<Public Key>" \
  VAPID_PRIVATE_KEY="<Private Key>" \
  VAPID_SUBJECT="mailto:tucorreo@ejemplo.com" \
  CRON_SECRET="<inventa-un-secreto-largo>"
```

> `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase solo; no los pongas tú.

## 5) Despliega la Edge Function

```bash
supabase functions deploy notify --no-verify-jwt
```

`--no-verify-jwt` porque la llama el cron (sin sesión de usuario); la protege el `CRON_SECRET`.

## 6) Programa el cron (cada hora)

Supabase → **Database → Extensions**: habilita `pg_cron` y `pg_net`. Luego en **SQL Editor**
(reemplaza `<REF>` y `<SECRET>`):

```sql
select cron.schedule('finanz-notify-hourly', '0 * * * *', $$
  select net.http_post(
    url := 'https://<REF>.supabase.co/functions/v1/notify',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<SECRET>'),
    body := '{}'::jsonb
  );
$$);
```

La función corre cada hora pero **solo te notifica a la hora que elegiste** (tu zona horaria).

## 7) En el iPhone

1. Abre la app en **Safari** → **Compartir → «Agregar a inicio»**.
2. Ábrela **desde el ícono** (instalada).
3. **Ajustes → Cuenta y nube**: inicia sesión.
4. **Ajustes → Notificaciones de gastos**: elige la hora y **Activar notificaciones** → acepta el
   permiso de iOS.

Listo. Recibirás avisos de los gastos con **fecha exacta** de hoy y mañana.

---

### Probar sin esperar al cron

Llama la función a mano (te llega si es tu hora de aviso):

```bash
curl -X POST 'https://<REF>.supabase.co/functions/v1/notify' \
  -H 'x-cron-secret: <SECRET>'
```

Para que llegue a cualquier hora en la prueba, pon temporalmente la "Hora del aviso" igual a tu
hora local actual.

### Notas

- Solo notifica gastos con **fecha exacta** (los puestos "por semana sin día" no tienen día puntual).
- Usa tu **escenario principal** (el primero) para decidir los gastos.
- El envío depende del servicio push de Apple; el timing puede variar unos minutos.
