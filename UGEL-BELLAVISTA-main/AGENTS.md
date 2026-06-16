# SISTEMA_MONITOREO - Resumen del Proyecto

## Arquitectura
- **Backend**: Node.js + Express + PostgreSQL
- **Frontend**: HTML + Vanilla JS + Chart.js + FullCalendar (CDN), CSS/JS inline en `public/index.html`
- **Autenticación**: Sesiones con express-session + connect-pg-simple, dos roles: `supervisor` y `director`

## Base de datos (PostgreSQL)
- `usuarios`: id, nombre_completo, dni, ie_codigo, rol (supervisor/director), dependencia, puesto, email, telefono, activo
- `actividades`: id, titulo, descripcion, tipo_id, fecha_limite, hora_limite, asignador_id
- `asignaciones`: id, actividad_id, director_id, ie_id, estado (pendiente/completada/no_cumplida), notas_supervisor
- `notificaciones`: id, usuario_id, remitente_id, titulo, mensaje, leida, tipo
- `tipos_actividad`: id, nombre
- `instituciones_educativas`: id, codigo, nombre, ruralidad, niveles (inicial/primaria/secundaria)

## API Endpoints
- **Auth**: POST/GET /api/login, /api/logout, /api/check-session
- **Directores**: GET /api/directores (incluye áreas del asignador), PUT /api/directores/:id
- **Actividades**: CRUD /api/actividades, GET /api/actividades/:id
- **Asignaciones**: GET /api/asignaciones (filtros: nivel/ruralidad/estado/buscar), POST /api/asignar, PUT /api/asignaciones/:id/estado
- **Notificaciones**: GET/POST /api/notificaciones, PUT /api/notificaciones/:id/leer, POST /api/responder
- **Dashboard**: GET /api/dashboard (filtros nivel/ruralidad/estado)
- **MISC**: GET /api/tipos-actividad, GET /api/ies, GET /api/perfil

## Vistas
- **Selector IE** (directores): Página de selección de institución educativa con búsqueda
- **Director Main**: Diseño plano con header UGEL, 4 KPIs (total/pendientes/cumplidas/vencidas), gráfico pie, panel de filtro, tabla con columnas: Actividad / Fecha Límite / Estado / Responsable / Teléfono
- **Supervisor Dashboard**: KPIs, top IEs vencidas, recientes, directores por área, charts
- **Asignar**: Crear actividad con checkboxes de IEs
- **Monitoreo**: Tabla con filtros (ruralidad/estado/buscar) + acciones
- **Directores**: Listado agrupado por área, con filtros
- **IEs**: Listado de instituciones con niveles
- **Notificaciones**: Enviar/recibir notificaciones
- **Calendario**: FullCalendar (mes/lista)
- **Perfil**: Editar datos personales

## Funcionalidades implementadas
- **Login**: Dos flujos - supervisores ingresan por nombre, directores seleccionan su IE de una lista (sin contraseña)
- **Dashboard director**: Diseño plano e institucional con KPIs de color, gráfico pie, tabla de actividades
- **Dashboard supervisor**: Resumen global con top vencidas, gráficos por ruralidad, directores por área
- **Asignación masiva**: Crear actividad y asignar a múltiples IEs simultáneamente
- **Cambio de estado**: Supervisor marca completada/no_cumplida con notas
- **Notificaciones bidireccionales**: Mensajes entre supervisor y director con remitente
- **Edición/eliminación**: Actividades editables desde monitoreo
- **Filtros**: Por ruralidad, nivel, estado y búsqueda por IE
- **Calendario**: FullCalendar con vista mes/lista, eventos coloreados por estado
- **Supervisores ven todo**: No hay filtro por asignador_id

## Cambios recientes
- **UI Director**: Rediseño completo plano (flat design) - sin sombras, teal/verde azulado, KPIs con línea de color inferior, pie chart (no donut), panel de filtro lateral, badges sólidos (rojo/amarillo/verde)
- **Login directores**: Ya no usan formulario - seleccionan su IE de una lista con búsqueda
- **Login supervisores**: Ingresan por nombre (sin cambios)
- **Directores por área**: Endpoint GET /api/directores ahora incluye campo `areas` (STRING_AGG de dependencias)
- **Login fix**: Búsqueda por scoring (no first-match-wins), código normalizado

## Comandos útiles
- `node server.js` (iniciar servidor, requiere DATABASE_URL en .env con PostgreSQL)
- `rg "palabra" --glob '*.{js,html}'` (búsqueda rápida)

<!-- Deployment check: 2026-06-10T21:56:00Z -->
