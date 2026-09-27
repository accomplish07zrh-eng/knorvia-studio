# Windows visual computer control

Computer Use is an optional built-in plugin, disabled by default. Enable it from Plugins. It contributes guidance and five tools to the existing execution host; it does not create another agent, model service, or chat page. The native driver starts only when a tool needs it.

## Tool flow

- `computer_list_windows`: list ordinary windows that can be selected; no screenshot or input.
- `computer_request_access`: ask the user for temporary control of one listed window, then return its first screenshot.
- `computer_observe`: return a fresh screenshot within that grant.
- `computer_action`: apply a click, double click, right click, drag, text, supported key or scroll using the latest observation; return a new screenshot.
- `computer_stop`: revoke the current scope and cancel pending work. A stopped scope cannot be resumed by replaying a request.

Tools are namespaced by the host. Follow their current JSON schemas. Coordinates are pixels of the returned image, with `(0, 0)` at its top-left. Clicks and drags use the driver's saved capture mapping. Pixel-based scrolling requires explicit foreground mode and a native-resolution validation frame to map coordinates; background pixel scrolling is rejected. Scrolling by an available accessibility token keeps the original observation. Independent cursor movement is not exposed. Resizing or moving a window invalidates the prior observation. Observations expire after 15 seconds and are consumed by actions. A repeated request ID never repeats input.

Each grant belongs to a workspace, session, turn, and window identity. Tool arguments cannot supply an approval, session, process identity, or coordinate transform. Remote sessions and subagents cannot use the local desktop. Each scope owns a bounded driver session; cancellation closes its process and invalidates its observations.

## Boundaries

Requires Windows x64, an interactive desktop and a model that can inspect images. The driver uses ordinary user permissions. Secure desktops, elevated applications and global application-switching keys are excluded. Screenshots include only the selected window and are sent through the current chat provider as tool images; do not grant access to a window containing information you do not want that provider to receive.

Screenshot availability varies by application. Protected, minimized or unsupported windows may refuse capture. Stop and report the limitation; do not replace a failed capture with a desktop screenshot. Delivered input is not proof of task completion. Cancellation during input can have an unknown outcome, so observe before choosing any further action.

The plugin bundles the open-source Cua driver used by the Hermes architecture. Knorvia pins version 0.30.1 and disables telemetry and update checks. It exposes only its reviewed computer tools, without driver update, extension installation or arbitrary MCP calls. See `THIRD-PARTY-NOTICES.md` and `CUA-LICENSE.txt` for attribution.

Plugin disablement removes the tools from subsequent runs. Use the current task's Stop control to interrupt an active run before disabling the plugin. Operations may focus a window and move the system pointer. Switching applications alone is not a reliable stop mechanism.
