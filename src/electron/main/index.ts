// https://github.com/electron/electron/blob/master/docs/api/sandbox-option.md
// https://github.com/electron/electron/blob/master/docs/api/process.md
// https://github.com/electron/electron/blob/master/docs/api/browser-window.md
// https://github.com/electron/electron/blob/master/docs/api/protocol.md
// https://github.com/electron/electron/blob/master/docs/api/web-frame.md
// https://github.com/electron/electron/blob/master/docs/api/web-contents.md
// https://github.com/electron/electron/blob/master/docs/api/web-request.md
// https://github.com/electron/electron/blob/master/docs/api/session.md
// https://github.com/electron/electron/blob/master/docs/api/webview-tag.md
// https://github.com/electron/electron/blob/master/docs/api/browser-view.md
// https://github.com/electron/electron/blob/master/docs/api/client-request.md
// https://github.com/electron/electron/blob/master/docs/api/sandbox-option.md
// https://github.com/electron/electron/blob/master/docs/api/dialog.md
// https://github.com/electron/electron/blob/master/docs/api/ipc-renderer.md

import * as fs from "fs";
import * as path from "path";

import { Publication } from "@models/publication";
import { launchStatusDocumentProcessing } from "@r2-lcp-js/lsd/status-document-processing";
import { setLcpNativePluginPath } from "@r2-lcp-js/parser/epub/lcp";
import { downloadEPUBFromLCPL } from "@r2-lcp-js/publication-download";
import { trackBrowserWindow } from "@r2-navigator-js/electron/main/browser-window-tracker";
import { installLcpHandler } from "@r2-navigator-js/electron/main/lcp";
import { lsdLcpUpdateInject } from "@r2-navigator-js/electron/main/lsd-injectlcpl";
import { setupReadiumCSS } from "@r2-navigator-js/electron/main/readium-css";
import { initSessions } from "@r2-navigator-js/electron/main/sessions";
import { initGlobals } from "@r2-shared-js/init-globals";
import { Server } from "@r2-streamer-js/http/server";
import { encodeURIComponent_RFC3986 } from "@utils/http/UrlUtils";
import * as debug_ from "debug";
import { BrowserWindow, Menu, app, dialog, ipcMain, webContents } from "electron";
import * as filehound from "filehound";
import * as portfinder from "portfinder";

import { R2_EVENT_DEVTOOLS } from "../common/events";
import { deviceIDManager } from "./lsd-deviceid-manager";

// import * as mime from "mime-types";

initGlobals();

const IS_DEV = (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "dev");

const lcpPluginPath = IS_DEV ?
    path.join(process.cwd(), "LCP", "lcp.node") :
    path.join(__dirname, "lcp.node");
setLcpNativePluginPath(lcpPluginPath);

const debug = debug_("r2:electron:main");

let _publicationsServer: Server;
let _publicationsServerPort: number;
let _publicationsRootUrl: string;
let _publicationsFilePaths: string[];
let _publicationsUrls: string[];

let DEFAULT_BOOK_PATH = path.join(IS_DEV ? process.cwd() : __dirname, "misc", "epubs");
debug(DEFAULT_BOOK_PATH);
if (fs.existsSync(DEFAULT_BOOK_PATH)) {
    debug("DEFAULT_BOOK_PATH => exists");
    DEFAULT_BOOK_PATH = fs.realpathSync(path.resolve(DEFAULT_BOOK_PATH));
    debug(DEFAULT_BOOK_PATH);
} else {
    debug("DEFAULT_BOOK_PATH => missing");
    DEFAULT_BOOK_PATH = ".";
}

let _lastBookPath: string | undefined;

// protocol.registerStandardSchemes(["epub", "file"], { secure: true });

function openAllDevTools() {
    for (const wc of webContents.getAllWebContents()) {
        // if (wc.hostWebContents &&
        //     wc.hostWebContents.id === electronBrowserWindow.webContents.id) {
        // }
        wc.openDevTools();
    }
}

// function openTopLevelDevTools() {
//     const bw = BrowserWindow.getFocusedWindow();
//     if (bw) {
//         bw.webContents.openDevTools();
//     } else {
//         const arr = BrowserWindow.getAllWindows();
//         arr.forEach((bww) => {
//             bww.webContents.openDevTools();
//         });
//     }
// }

ipcMain.on(R2_EVENT_DEVTOOLS, (_event: any, _arg: any) => {
    openAllDevTools();
});

async function createElectronBrowserWindow(publicationFilePath: string, publicationUrl: string) {

    debug("createElectronBrowserWindow() " + publicationFilePath + " : " + publicationUrl);

    // const fileName = path.basename(publicationFilePath);
    // const ext = path.extname(fileName).toLowerCase();

    let publication: Publication;
    try {
        publication = await _publicationsServer.loadOrGetCachedPublication(publicationFilePath);
    } catch (err) {
        debug(err);
        return;
    }

    let lcpHint: string | undefined;
    if (publication && publication.LCP) {
        try {
            await launchStatusDocumentProcessing(publication.LCP, deviceIDManager,
                async (licenseUpdateJson: string | undefined) => {
                    debug("launchStatusDocumentProcessing DONE.");

                    if (licenseUpdateJson) {
                        let res: string;
                        try {
                            res = await lsdLcpUpdateInject(licenseUpdateJson, publication, publicationFilePath);
                            debug("EPUB SAVED: " + res);
                        } catch (err) {
                            debug(err);
                        }
                    }
                });
        } catch (err) {
            debug(err);
        }

        if (publication.LCP.Encryption &&
            publication.LCP.Encryption.UserKey &&
            publication.LCP.Encryption.UserKey.TextHint) {
            lcpHint = publication.LCP.Encryption.UserKey.TextHint;
        }
        if (!lcpHint) {
            lcpHint = "LCP passphrase";
        }
    }

    const electronBrowserWindow = new BrowserWindow({
        height: 600,
        webPreferences: {
            allowRunningInsecureContent: false,
            contextIsolation: false,
            devTools: true,
            nodeIntegration: true,
            nodeIntegrationInWorker: false,
            sandbox: false,
            webSecurity: true,
            webviewTag: true,
            // preload: __dirname + "/" + "preload.js",
        },
        width: 800,
    });
    trackBrowserWindow(electronBrowserWindow);

    // electronBrowserWindow.on("resize", () => {
    //     const [width, height] = electronBrowserWindow.getContentSize();

    //     for (const wc of webContents.getAllWebContents()) {
    //         if (wc.hostWebContents &&
    //             wc.hostWebContents.id === electronBrowserWindow.webContents.id) {
    //             wc.setSize({
    //                 normal: {
    //                     height: 400,
    //                     width,
    //                 },
    //             });
    //         }
    //     }
    // });

    electronBrowserWindow.webContents.on("dom-ready", () => {
        debug("electronBrowserWindow dom-ready " + publicationFilePath + " : " + publicationUrl);
        // electronBrowserWindow.webContents.openDevTools();
    });

    const urlEncoded = encodeURIComponent_RFC3986(publicationUrl);
    let htmlPath = IS_DEV ? `${__dirname}/../renderer/index.html` : `${__dirname}/index.html`;
    htmlPath = htmlPath.replace(/\\/g, "/");
    let fullUrl = `file://${htmlPath}?pub=${urlEncoded}`;
    if (lcpHint) {
        fullUrl = fullUrl + "&lcpHint=" + encodeURIComponent_RFC3986(lcpHint);
    }
    // fullUrl = fullUrl + "&lcpPlugin=" + encodeURIComponent_RFC3986(Buffer.from(lcpPluginPath).toString("base64"));

    // `file://${process.cwd()}/src/electron/renderer/index.html`;
    // `file://${__dirname}/../../../../src/electron/renderer/index.html`
    debug(fullUrl);
    electronBrowserWindow.webContents.loadURL(fullUrl, { extraHeaders: "pragma: no-cache\n" });
}

initSessions();

app.on("ready", () => {
    debug("app ready");

    // protocol.registerServiceWorkerSchemes(["epub"]);

    // registerFileProtocol
    // protocol.registerBufferProtocol("epub",
    //     (request, callback) => {
    //         debug(request.url);
    //         const data = fs.readFileSync(request.url);
    //         const mimeType = mime.lookup(request.url);
    //         callback({ data, mimeType });
    //     }, (error) => {
    //         debug(error);
    //     });

    // tslint:disable-next-line:no-floating-promises
    (async () => {
        try {
            _publicationsFilePaths = await filehound.create()
                .depth(0)
                .ignoreHiddenDirectories()
                .ignoreHiddenFiles()
                // .discard("node_modules")
                // .discard(".*.asar")
                .paths(DEFAULT_BOOK_PATH)
                .ext([".epub", ".epub3", ".cbz", ".lcpl"])
                .find();
        } catch (err) {
            debug(err);
        }
        debug(_publicationsFilePaths);

        _publicationsServer = new Server({
            disableDecryption: false,
            disableReaders: false,
        });

        installLcpHandler(_publicationsServer, deviceIDManager);

        const readiumCSSPath = IS_DEV ?
            path.join(process.cwd(), "dist", "ReadiumCSS").replace(/\\/g, "/") :
            path.join(__dirname, "ReadiumCSS").replace(/\\/g, "/");

        setupReadiumCSS(_publicationsServer, readiumCSSPath);

        // _publicationsServer.expressGet(["/resize-sensor.js"],
        //     (req: express.Request, res: express.Response) => {

        //         const swPth = "./renderer/ResizeSensor.js";
        //         const swFullPath = path.resolve(path.join(__dirname, swPth));
        //         if (!fs.existsSync(swFullPath)) {

        //             const err = "Missing ResizeSensor JS! ";
        //             debug(err + swFullPath);
        //             res.status(500).send("<html><body><p>Internal Server Error</p><p>"
        //                 + err + "</p></body></html>");
        //             return;
        //         }

        //         const swJS = fs.readFileSync(swFullPath, { encoding: "utf8" });
        //         // debug(swJS);

        //         // this.setResponseCORS(res);
        //         res.set("Content-Type", "text/javascript; charset=utf-8");

        //         const checkSum = crypto.createHash("sha256");
        //         checkSum.update(swJS);
        //         const hash = checkSum.digest("hex");

        //         const match = req.header("If-None-Match");
        //         if (match === hash) {
        //             debug("ResizeSensor.js cache");
        //             res.status(304); // StatusNotModified
        //             res.end();
        //             return;
        //         }

        //         res.setHeader("ETag", hash);
        //         // res.setHeader("Cache-Control", "public,max-age=86400");

        //         res.status(200).send(swJS);
        //     });

        // _publicationsServer.expressGet(["/sw.js"],
        //     (req: express.Request, res: express.Response) => {

        //         const swPth = "./renderer/sw/service-worker.js";
        //         const swFullPath = path.resolve(path.join(__dirname, swPth));
        //         if (!fs.existsSync(swFullPath)) {

        //             const err = "Missing Service Worker JS! ";
        //             debug(err + swFullPath);
        //             res.status(500).send("<html><body><p>Internal Server Error</p><p>"
        //                 + err + "</p></body></html>");
        //             return;
        //         }

        //         const swJS = fs.readFileSync(swFullPath, { encoding: "utf8" });
        //         // debug(swJS);

        //         // this.setResponseCORS(res);
        //         res.set("Content-Type", "text/javascript; charset=utf-8");

        //         const checkSum = crypto.createHash("sha256");
        //         checkSum.update(swJS);
        //         const hash = checkSum.digest("hex");

        //         const match = req.header("If-None-Match");
        //         if (match === hash) {
        //             debug("service-worker.js cache");
        //             res.status(304); // StatusNotModified
        //             res.end();
        //             return;
        //         }

        //         res.setHeader("ETag", hash);
        //         // res.setHeader("Cache-Control", "public,max-age=86400");

        //         res.status(200).send(swJS);
        //     });

        const pubPaths = _publicationsServer.addPublications(_publicationsFilePaths);

        try {
            _publicationsServerPort = await portfinder.getPortPromise();
        } catch (err) {
            debug(err);
        }
        _publicationsRootUrl = _publicationsServer.start(_publicationsServerPort);

        _publicationsUrls = pubPaths.map((pubPath) => {
            return `${_publicationsRootUrl}${pubPath}`;
        });
        debug(_publicationsUrls);

        resetMenu();

        process.nextTick(async () => {

            const args = process.argv.slice(2);
            console.log("args:");
            console.log(args);
            let filePathToLoadOnLaunch: string | undefined;
            if (args && args.length && args[0]) {
                const argPath = args[0].trim();
                let filePath = argPath;
                console.log(filePath);
                if (!fs.existsSync(filePath)) {
                    filePath = path.join(__dirname, argPath);
                    console.log(filePath);
                    if (!fs.existsSync(filePath)) {
                        filePath = path.join(process.cwd(), argPath);
                        console.log(filePath);
                        if (!fs.existsSync(filePath)) {
                            console.log("FILEPATH DOES NOT EXIST: " + filePath);
                        } else {
                            filePathToLoadOnLaunch = filePath;
                        }
                    } else {
                        filePathToLoadOnLaunch = filePath;
                    }
                } else {
                    filePath = fs.realpathSync(filePath);
                    console.log(filePath);
                    filePathToLoadOnLaunch = filePath;
                }
            }

            if (filePathToLoadOnLaunch) {
                await openFileDownload(filePathToLoadOnLaunch);
                return;
            }

            const detail = "Note that this is only a developer application (" +
                "test framework) for the Readium2 NodeJS 'streamer' and Electron-based 'navigator'.";
            const message = "Use the 'Electron' menu to load publications.";

            if (process.platform === "darwin") {
                const choice = dialog.showMessageBox({
                    buttons: ["&OK"],
                    cancelId: 0,
                    defaultId: 0,
                    detail,
                    message,
                    noLink: true,
                    normalizeAccessKeys: true,
                    title: "Readium2 Electron streamer / navigator",
                    type: "info",
                });
                if (choice === 0) {
                    debug("ok");
                }
            } else {
                const html = `<html><h2>${message}<hr>${detail}</h2></html>`;
                const electronBrowserWindow = new BrowserWindow({
                    height: 300,
                    webPreferences: {
                        allowRunningInsecureContent: false,
                        contextIsolation: false,
                        devTools: false,
                        nodeIntegration: false,
                        nodeIntegrationInWorker: false,
                        sandbox: false,
                        webSecurity: true,
                        webviewTag: false,
                        // preload: __dirname + "/" + "preload.js",
                    },
                    width: 400,
                });

                electronBrowserWindow.webContents.loadURL("data:text/html," + html);
            }
        });
    })();
});

function resetMenu() {

    const menuTemplate = [
        {
            label: "Readium2 Electron",
            submenu: [
                {
                    accelerator: "Command+Q",
                    click: () => { app.quit(); },
                    label: "Quit",
                },
            ],
        },
        {
            label: "Open",
            submenu: [
            ],
        },
        {
            label: "Tools",
            submenu: [
                {
                    accelerator: "Command+B",
                    click: () => {
                        // openTopLevelDevTools();
                        openAllDevTools();
                    },
                    label: "Open Dev Tools",
                },
            ],
        },
    ];

    menuTemplate[1].submenu.push({
        click: async () => {
            const choice = dialog.showOpenDialog({
                defaultPath: _lastBookPath || DEFAULT_BOOK_PATH,
                filters: [
                    { name: "EPUB publication", extensions: ["epub", "epub3"] },
                    { name: "LCP license", extensions: ["lcpl"] },
                    { name: "Comic book", extensions: ["cbz"] },
                    // {name: "Zip archive", extensions: ["zip"]},
                    // {name: "Any file", extensions: ["*"]},
                ],
                message: "Choose a file",
                properties: ["openFile"],
                title: "Load a publication",
            });
            if (!choice || !choice.length) {
                return;
            }
            const filePath = choice[0];
            debug(filePath);
            await openFileDownload(filePath);
        },
        label: "Load file...",
    } as any);

    _publicationsUrls.forEach((pubManifestUrl, n) => {
        const filePath = _publicationsFilePaths[n];
        debug("MENU ITEM: " + filePath + " : " + pubManifestUrl);

        menuTemplate[1].submenu.push({
            click: async () => {
                debug(filePath);
                await openFileDownload(filePath);
            },
            label: filePath, // + " : " + pubManifestUrl,
        } as any);
    });
    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);
}

async function openFileDownload(filePath: string) {
    const dir = path.dirname(filePath);
    _lastBookPath = dir;
    debug(_lastBookPath);

    const ext = path.extname(filePath);
    const filename = path.basename(filePath);
    const destFileName = filename + ".epub";
    if (ext === ".lcpl") {
        let epubFilePath: string[];
        try {
            epubFilePath = await downloadEPUBFromLCPL(filePath, dir, destFileName);
        } catch (err) {
            process.nextTick(() => {
                const detail = (typeof err === "string") ?
                    err :
                    (err.toString ? err.toString() : "ERROR!?");
                const message = "LCP EPUB download fail!]";
                const res = dialog.showMessageBox({
                    buttons: ["&OK"],
                    cancelId: 0,
                    defaultId: 0,
                    detail,
                    message,
                    noLink: true,
                    normalizeAccessKeys: true,
                    title: "Readium2 Electron streamer / navigator",
                    type: "info",
                });
                if (res === 0) {
                    debug("ok");
                }
            });
            return;
        }

        const result = epubFilePath as string[];
        process.nextTick(async () => {
            const detail = result[0] + " ---- [" + result[1] + "]";
            const message = "LCP EPUB file download success [" + destFileName + "]";
            const res = dialog.showMessageBox({
                buttons: ["&OK"],
                cancelId: 0,
                defaultId: 0,
                detail,
                message,
                noLink: true,
                normalizeAccessKeys: true,
                title: "Readium2 Electron streamer / navigator",
                type: "info",
            });
            if (res === 0) {
                debug("ok");
            }

            await openFile(result[0]);
        });
    } else {
        await openFile(filePath);
    }
}

async function openFile(filePath: string) {
    let n = _publicationsFilePaths.indexOf(filePath);
    if (n < 0) {
        const publicationPaths = _publicationsServer.addPublications([filePath]);
        debug(publicationPaths);

        _publicationsFilePaths.push(filePath);
        debug(_publicationsFilePaths);

        _publicationsUrls.push(`${_publicationsRootUrl}${publicationPaths[0]}`);
        debug(_publicationsUrls);

        n = _publicationsFilePaths.length - 1; // === _publicationsUrls.length - 1

        process.nextTick(() => {
            resetMenu();
        });
    }

    const file = _publicationsFilePaths[n];
    const pubManifestUrl = _publicationsUrls[n];

    await createElectronBrowserWindow(file, pubManifestUrl);
}

app.on("activate", () => {
    debug("app activate");
});

app.on("before-quit", () => {
    debug("app before quit");
});

app.on("window-all-closed", () => {
    debug("app window-all-closed");
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("quit", () => {
    debug("app quit");

    _publicationsServer.stop();
});
