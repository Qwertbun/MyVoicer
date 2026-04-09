Deep Refactor V2 (Full-Stack, Breaking, TypeScript+ESM)
Summary

Выполнить один большой проход с полной V2-архитектурой параллельно текущей версии (V1 остаётся до cutover).
Целевой стек: TypeScript + ESM, frontend vanilla TS, backend Fastify + raw WebSocket + REST, storage PostgreSQL + Redis + S3-compatible.
Цель: ускорение realtime media path при полном функциональном паритете (voice/chat/screen/relay/p2p/electron) и управляемом переключении Blue/Green.
Implementation Changes

Архитектура V2 и границы модулей
Создать изолированные V2-домены: protocol, backend, frontend, desktop с единым типизированным контрактом сообщений.
Вынести все wire-контракты в общий TS-слой: события, payload-схемы, коды ошибок, ack-обёртка.
Принять единый формат ack: { ok, data?, errorCode?, message?, requestId }.
Для JSON-сообщений WebSocket ввести обязательные поля: { v: 2, type, requestId, payload }.
Убрать зависимость V2 от глобальных скриптов; только import/export и явные зависимости.
Backend V2 (Fastify + WS + data layer)
Реализовать новый REST namespace v2 и новый WS endpoint v2/ws без Socket.IO-совместимости.
Разделить backend на сервисы: RoomService, VoiceService, SignalService, RelayService, AttachmentService, P2PAdapter, PresenceService.
Перенести persistent state в PostgreSQL: комнаты, сообщения, каналы, чекпоинты истории/редактирования.
Перенести ephemeral state и fanout coordination в Redis: presence, throttling, pub/sub межинстансной синхронизации.
Оставить вложения в S3-compatible storage через presigned upload/download и resumable multipart flow.
Ввести backpressure и bounded-очереди на WS fanout, batched broadcast для room-wide событий, ограничение payload по типам событий.
Оставить P2P-функциональность через отдельный transport adapter, подключаемый к общему доменному слою (без дублирования бизнес-логики).
Frontend V2 (vanilla TS + ESM)
Пересобрать runtime в модульные слои: state, protocol-client, media-engine, chat-engine, ui-renderer, commands, bootstrap.
Реализовать централизованный state-store с селекторами и минимальными зонами перерисовки (без глобального mutable-хаоса).
Перенести relay crypto/attachment path в отдельный worker-процесс (шифрование/дешифрование/chunk processing вне main thread).
Перевести media pipeline на явный scheduler: разделение control-plane и render-plane, устранение лишних DOM/track операций в горячем пути.
Сохранить текущий функциональный UX-объём, но принять breaking wire-протокол V2 (старый клиент не совместим с новым WS API).
Desktop V2 (Electron)
Ввести типизированный IPC-контракт preload/main, убрать неявные каналы и неструктурированные payload.
Переключить desktop runtime на V2 frontend entry и V2 backend endpoints по конфигу.
Обновить desktop bootstrap под новый протокол и новую структуру модулей, сохранив auto-update контур в рамках текущего release flow.
Миграция и переключение (Blue/Green)
Запускать V1 и V2 параллельно; V2 доступна отдельным entrypoint/флагом.
Ввести feature flag runtime_version для маршрутизации клиентов в V1 или V2.
Выполнить cutover по Blue/Green: сначала ограниченный трафик в V2, затем полное переключение, затем deprecate V1.
Public Interfaces (breaking changes)

Новый WebSocket протокол V2: raw WS JSON envelope (v/type/requestId/payload), без Socket.IO event model.
Новый REST namespace V2 для network mode, ICE config, relay uploads, attachment URL flow.
Новый типизированный IPC-контракт Electron V2 (структурированные команды/ответы вместо ad-hoc вызовов).
Внешняя совместимость V1-клиентов с V2 не поддерживается; V1 сохраняется только как временный параллельный runtime.
Test Plan (gating: functional)

Функциональные интеграционные сценарии backend+frontend: join/leave, host election/re-election, voice channel CRUD, signaling, reconnect.
Функциональные relay-сценарии: encrypted message send/edit/delete, history replay, large attachment upload/resume/download/abort.
Функциональные screen-share сценарии: start/stop, audio/no-audio, host/member transitions, multi-peer forwarding.
Функциональные P2P сценарии: discovery, room sync, message/voice metadata propagation.
Функциональные desktop сценарии: window controls, preload IPC, startup flow, update handshake.
Smoke-check migration сценария Blue/Green: mixed runtime routing, rollback на V1 без потери критичных данных.
Assumptions and Defaults

Разрешены breaking changes и несовместимость wire-level между V1 и V2.
Минимальная поддержка runtime: modern Chromium/Electron; fallback для старых браузеров не реализуется.
Аутентификация/авторизация не добавляется в этом проходе (функциональный паритет с текущим продуктовым уровнем).
Поставка одним большим проходом в одной крупной итерации, без промежуточных публичных checkpoint-PR.
Текущие изменения зависимостей в package.json сохраняются как есть и не откатываются в рамках рефакторинга.