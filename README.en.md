# QiMegaClaim ©THS

[繁體中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [Português (Brasil)](README.pt-BR.md)

## Introduction

This extension saves manual work by quickly adding Megascans assets to your Library.

Before your first run, confirm that you are signed in. Two actions are available after signing in:

1. **Claim all**: scan the catalog and add assets to your Library as scanning progresses.
2. **Scan asset library**: scan the catalog without adding assets to your Library.

You can set the **delay between batches** (suggested: 300 ms or more) and **items per batch** (suggested: 3–10). Larger batches should use longer delays.

Suggested settings:

| Items per batch | Delay between batches |
|---|---|
| 3–5 | 300 ms |
| 6–10 | 500–800 ms |

These settings help reduce the risk of server rate limits; the values are starting points. If a limit is triggered, the extension automatically increases the batch delay and updates the input and status notice. You can also pause, increase the delay manually, and resume. The delay starts after the entire batch finishes; this extension does not download model files.

If you encounter a problem, export the **LOG** and email it to **thstudio3419@pm.me**.

## Installation

1. On our GitHub page, download the extension archive **QiMegaClaim @THS.zip**.
2. Extract the downloaded ZIP file, then open Google Chrome’s extensions settings page: `chrome://extensions/`.
3. Enable **Developer mode** in the upper-right corner.
4. Click **Load unpacked** in the upper-left corner.
5. Select the extracted **QiMegaClaim @THS** folder and confirm.
6. Click the QiMegaClaim icon in the browser’s extensions area, then click **Open Quixel Megascans** to launch the extension!

## Usage

Once signed in, click **Claim all**. For other settings, click the **!** help button at the upper right of the extension’s bottom toolbar.

To update, reload the extension on Chrome’s extensions page and refresh Fab. You do not need to uninstall it.

## Contact

TH Studio · thstudio3419@pm.me
