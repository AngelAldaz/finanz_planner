# Activar la nube (Supabase) — ~5 min

La app funciona **100% local** sin esto. La nube añade **respaldo + sincronización** entre dispositivos, manteniendo el funcionamiento offline. Gana la última versión guardada (ideal para una persona en iPhone + compu).

## 1. Crea un proyecto

1. Entra a <https://supabase.com> → **New project** (plan free).
2. Espera a que termine de aprovisionar (~1 min).

## 2. Crea la tabla + seguridad

1. En el panel: **SQL Editor → New query**.
2. Pega el contenido de [`supabase/schema.sql`](supabase/schema.sql) y dale **Run**.

## 3. (Recomendado) Quita la confirmación por correo

Para que _email + contraseña_ entre de inmediato:

- **Authentication → Sign In / Providers → Email** → desactiva **"Confirm email"**.

Si lo dejas activo, tendrás que confirmar por correo antes de poder sincronizar.

## 4. Pega tus llaves

1. **Project Settings → API**: copia **Project URL** y la **anon public key**.
2. En la raíz del proyecto, copia `.env.example` a `.env` y pega:

   ```
   VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```

3. Reinicia `pnpm dev` (o vuelve a `pnpm build`).

## 5. Úsala

En la app: **Ajustes → Cuenta y nube** → crea tu cuenta con correo + contraseña.

- Tus datos **suben a la nube** y se sincronizan solos al cambiar.
- En **otro dispositivo** (con las mismas llaves), inicia sesión y **baja** tu información.

> **Seguridad:** cada usuario solo ve su propio snapshot (RLS por `auth.uid()`). La _anon key_ es pública (va en el cliente) — eso es normal en Supabase; la seguridad la da RLS, no esconder la llave. El PIN local sigue siendo un gate de privacidad aparte.
