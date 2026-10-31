# Notes

Working notes for everyone building Quorum Run.

## Page (agent-37)

The browser entry is `src/main.js` only: it owns the canvas, the frame
loop (a `step` every `tickMs(settings)` with the queued input), the menu
screens, the audio contexts, and pause routing. The menu state machine
(`src/ui/menu.js`) and `status.paused` are kept in sync by queueing a
pause input whenever the paused screen is entered or left. Everything
else (rules, renderer, audio, input mapping) lives in its own module;
nothing but `src/main.js` touches the DOM.
