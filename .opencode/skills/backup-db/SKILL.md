---
name: backup-db
description: Use when the user asks to back up, dump, snapshot, or protect the database before a risky change ("backup", "respaldo", "dump", "backup de la base de datos", "antes de migrar"). Runs scripts/backup_db.ps1 (pg_dump custom format + gzip + retention).
---

# Backup de la base de datos

Genera un dump comprimido de PostgreSQL usando el script del repo.

## Precondiciones

1. `pg_dump` disponible en el `PATH` (viene con PostgreSQL Client Tools).
2. `DATABASE_URL` definida. El script la lee del `.env` de la **raíz** del
   monorepo; si no existe, para y avisa.
3. La URL debe tener el formato
   `postgresql://user:pass@host:port/db` — el script parsea con regex y **falla**
   con URLs de Neon que no incluyan puerto explícito. Si falla el parseo, exporta
   `DATABASE_URL` a mano con el puerto explícito.

## Ejecución

Desde la raíz del monorepo:

```powershell
.\scripts\backup_db.ps1
```

Con parámetros opcionales:

```powershell
.\scripts\backup_db.ps1 -OutputDir ".\backups" -RetainDays 30
```

Qué hace el script:
- Dump en formato custom (`pg_dump -Fc`) → `backups/variedades_angelly_<timestamp>.dump`
- Comprime con `gzip` si está disponible → `.dump.gz`
- Borra dumps con antigüedad mayor a `-RetainDays`

## Reglas de seguridad

- **Nunca** corras esto contra producción sin que el dueño lo pida explícito.
- Verifica el `host` del `DATABASE_URL` **antes** de ejecutar: si resuelve a
  Neon y el `hostname` no es un Postgres local, estás a un comando de respaldar
  (o volcar) la base equivocada. Muestra el host en tu respuesta antes de
  ejecutar.
- No borres el directorio `backups/` ni sus archivos sin permiso.

## Resultado

Reporta la ruta del archivo generado y su tamaño. Si el script falla, devuelve
el mensaje de error de `pg_dump` tal cual (suele ser credenciales, red o
`pg_dump` no instalado).
