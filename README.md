# Endfield AIC Planner

A fan-made factory planner for the **AIC** (Automated Industry Complex) of *Arknights: Endfield*.
Plan a base on a grid, let belts and pipes route themselves, see the throughput of every machine,
and simulate the factory over time — in the browser, as a Windows app, or on an Android phone.

> Fan-made tool, **not affiliated with or endorsed by Hypergryph / Gryphline**. See [NOTICE](NOTICE).

*Tiếng Việt: xem [bên dưới](#tiếng-việt).*

## Features

- **Map planner** — two-layer grid editor (ground / elevated) with the real machine footprints and ports,
  auto-routing for belts and pipes (bridges at crossings, splitters / mergers / control ports), rotation,
  multi-select, copy / paste, undo / redo, map tabs and tab groups.
- **Throughput solver** — rates per machine and per line, belt / pipe capacity, backpressure, power supply
  and pylon range, activator gas, catalyst environments, depot (core) input / output.
- **Simulation** — time-based simulation of the whole map (or a group of maps sharing depot and power):
  precomputed up to 24 h, timeline you can scrub, production / depot charts, per-machine state, blackout when
  power runs out.
- **Modeler** — a Satisfactory-Modeler-style node graph: machines + recipes as nodes, demand propagated
  backwards, partial machines shown in %, flow limits on pipes, crucibles that scale with demand.
- **Recipe library** — every item with its sources and uses, production chains from raw materials, and
  "Modelize" to turn a chain into a Modeler graph.
- **Blueprint library** — save modules, whole maps and Modeler graphs; import / export as `.efp.json`.
- **Platforms** — web, Windows desktop app (Tauri), Android app (Capacitor, touch UI); Vietnamese and English.
- **Background music** — pick your own MP3 in Settings (stored only in your browser / app).

## Run it locally

Requires [Node.js](https://nodejs.org/) 20+.

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests (vitest)
npm run build        # static site in dist/
npm run build:public # public build (without the EnKAD blueprint-code import)
```

The app is a static site: `dist/` can be served by any static host.

### Desktop app (Windows)

Uses [Tauri 2](https://tauri.app/) — needs Rust and the Visual Studio C++ Build Tools.
`tools\build-app-windows.cmd` builds `src-tauri\target\release\EndfieldAICPlanner.exe` and an NSIS installer.

### Android app

Uses [Capacitor](https://capacitorjs.com/) — needs the Android SDK and JDK 21.

```bash
npx vite build
npx cap sync android
cd android && ./gradlew assembleDebug
```

## Data and credits

- Game data (machines, recipes, items, names) and item / machine icons come from the game, extracted
  through [EnKAD](https://beta.enka.network/endfield/aic) — thanks to its authors.
- High-resolution item images and descriptions in the recipe library: [endfield.wiki.gg](https://endfield.wiki.gg/)
  contributors.
- Ground texture and the 2D logistics devices are cut from in-game screenshots.
- All game assets © Hypergryph / Gryphline. The MIT licence of this repository covers the source code only —
  see [NOTICE](NOTICE).

## License

Source code: [MIT](LICENSE). Game assets: see [NOTICE](NOTICE).

---

## Tiếng Việt

Công cụ quy hoạch nhà máy **AIC** cho *Arknights: Endfield* do fan làm — **không liên kết với Hypergryph / Gryphline**.

- **Map:** đặt máy trên lưới 2 tầng, băng chuyền / ống tự tìm đường, tính thông lượng, điện, chất kích hoạt,
  môi trường xúc tác, kho tổng.
- **Mô phỏng:** chạy nhà máy theo thời gian (tới 24 giờ), tua lại, biểu đồ sản lượng.
- **Modeler:** sơ đồ nút kiểu Satisfactory Modeler, tự tính số máy theo nhu cầu.
- **Thư viện công thức** và **thư viện bản vẽ** (nhập / xuất `.efp.json`).
- Chạy trên **web**, **Windows** (exe) và **Android**; tiếng Việt và tiếng Anh.
- **Nhạc nền:** tự chọn file MP3 của bạn trong Cài đặt.

Chạy thử trên máy: cài Node.js 20+, rồi `npm install` và `npm run dev`.

Mã nguồn theo giấy phép MIT; hình ảnh, dữ liệu và âm thanh của game thuộc Hypergryph / Gryphline (xem NOTICE).
