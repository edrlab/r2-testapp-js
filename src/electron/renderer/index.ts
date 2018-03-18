import * as path from "path";

import { IStringMap } from "@models/metadata-multilang";
import { Publication } from "@models/publication";
import { IEventPayload_R2_EVENT_READIUMCSS } from "@r2-navigator-js/electron/common/events";
import {
    READIUM2_ELECTRON_HTTP_PROTOCOL,
    convertCustomSchemeToHttpUrl,
} from "@r2-navigator-js/electron/common/sessions";
import { getURLQueryParams } from "@r2-navigator-js/electron/renderer/common/querystring";
import {
    DOM_EVENT_HIDE_VIEWPORT,
    DOM_EVENT_SHOW_VIEWPORT,
    handleLink,
    installNavigatorDOM,
    navLeftOrRight,
    readiumCssOnOff as readiumCssOnOff_,
    setReadingLocationSaver,
    setReadiumCssJsonGetter,
} from "@r2-navigator-js/electron/renderer/index";
import { initGlobals } from "@r2-shared-js/init-globals";
import { encodeURIComponent_RFC3986 } from "@utils/http/UrlUtils";
import { ipcRenderer, webFrame } from "electron";
import { JSON as TAJSON } from "ta-json";

import {
    IEventPayload_R2_EVENT_LCP_LSD_RENEW,
    IEventPayload_R2_EVENT_LCP_LSD_RENEW_RES,
    IEventPayload_R2_EVENT_LCP_LSD_RETURN,
    IEventPayload_R2_EVENT_LCP_LSD_RETURN_RES,
    IEventPayload_R2_EVENT_TRY_LCP_PASS,
    IEventPayload_R2_EVENT_TRY_LCP_PASS_RES,
    R2_EVENT_LCP_LSD_RENEW,
    R2_EVENT_LCP_LSD_RENEW_RES,
    R2_EVENT_LCP_LSD_RETURN,
    R2_EVENT_LCP_LSD_RETURN_RES,
    R2_EVENT_TRY_LCP_PASS,
    R2_EVENT_TRY_LCP_PASS_RES,
} from "../common/events";
import { IStore } from "../common/store";
import { StoreElectron } from "../common/store-electron";
import {
    IRiotOptsLinkList,
    IRiotOptsLinkListItem,
    IRiotTagLinkList,
    riotMountLinkList,
} from "./riots/linklist/index_";
import {
    IRiotOptsLinkListGroup,
    IRiotOptsLinkListGroupItem,
    IRiotTagLinkListGroup,
    riotMountLinkListGroup,
} from "./riots/linklistgroup/index_";
import {
    IRiotOptsLinkTree,
    IRiotOptsLinkTreeItem,
    IRiotTagLinkTree,
    riotMountLinkTree,
} from "./riots/linktree/index_";
import {
    IRiotOptsMenuSelect,
    IRiotOptsMenuSelectItem,
    IRiotTagMenuSelect,
    riotMountMenuSelect,
} from "./riots/menuselect/index_";

import SystemFonts = require("system-font-families");

import debounce = require("debounce");

const IS_DEV = (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "dev");

const queryParams = getURLQueryParams();

webFrame.registerURLSchemeAsSecure(READIUM2_ELECTRON_HTTP_PROTOCOL);
// webFrame.registerURLSchemeAsBypassingCSP(READIUM2_ELECTRON_HTTP_PROTOCOL);
webFrame.registerURLSchemeAsPrivileged(READIUM2_ELECTRON_HTTP_PROTOCOL, {
    allowServiceWorkers: false,
    bypassCSP: false,
    corsEnabled: false,
    secure: true,
    supportFetchAPI: true,
});

const electronStore: IStore = new StoreElectron("readium2-testapp", {
    basicLinkTitles: true,
    styling: {
        align: "left",
        colCount: "auto",
        dark: false,
        font: "DEFAULT",
        fontSize: "100%",
        invert: false,
        lineHeight: "1.5",
        night: false,
        paged: false,
        readiumcss: false,
        sepia: false,
    },
});

const electronStoreLCP: IStore = new StoreElectron("readium2-testapp-lcp", {});

// console.log(window.location);
// console.log(document.baseURI);
// console.log(document.URL);

initGlobals();

// tslint:disable-next-line:no-string-literal
const pubServerRoot = queryParams["pubServerRoot"];
console.log(pubServerRoot);

const computeReadiumCssJsonMessage = (): IEventPayload_R2_EVENT_READIUMCSS => {

    const on = electronStore.get("styling.readiumcss");
    if (on) {
        const align = electronStore.get("styling.align") as string;
        const colCount = electronStore.get("styling.colCount") as string;
        const dark = electronStore.get("styling.dark") as boolean;
        const font = electronStore.get("styling.font") as string;
        const fontSize = electronStore.get("styling.fontSize") as string;
        const lineHeight = electronStore.get("styling.lineHeight") as string;
        const invert = electronStore.get("styling.invert") as boolean;
        const night = electronStore.get("styling.night") as boolean;
        const paged = electronStore.get("styling.paged") as boolean;
        const sepia = electronStore.get("styling.sepia") as boolean;
        const cssJson = {
            align,
            colCount,
            dark,
            font,
            fontSize,
            invert,
            lineHeight,
            night,
            paged,
            sepia,
        };
        const jsonMsg: IEventPayload_R2_EVENT_READIUMCSS = {
            injectCSS: "yes",
            setCSS: cssJson,
            urlRoot: pubServerRoot,
        };
        return jsonMsg;
    } else {
        return { injectCSS: "rollback", setCSS: "rollback" };
    }
};
setReadiumCssJsonGetter(computeReadiumCssJsonMessage);

const saveReadingLocation = (doc: string, loc: string) => {
    let obj = electronStore.get("readingLocation");
    if (!obj) {
        obj = {};
    }
    obj[pathDecoded] = {
        doc,
        loc,
    };
    electronStore.set("readingLocation", obj);
};
setReadingLocationSaver(saveReadingLocation);

// import * as path from "path";
// import { setLcpNativePluginPath } from "@r2-streamer-js/parser/epub/lcp";
// // tslint:disable-next-line:no-string-literal
// const lcpPluginBase64 = queryParams["lcpPlugin"];
// if (lcpPluginBase64) {
//     const lcpPlugin = window.atob(lcpPluginBase64);
//     setLcpNativePluginPath(lcpPlugin);
// } else {
//     setLcpNativePluginPath(path.join(process.cwd(), "LCP", "lcp.node"));
// }

// tslint:disable-next-line:no-string-literal
let publicationJsonUrl = queryParams["pub"];
console.log(publicationJsonUrl);
const publicationJsonUrl_ = publicationJsonUrl.startsWith(READIUM2_ELECTRON_HTTP_PROTOCOL) ?
    convertCustomSchemeToHttpUrl(publicationJsonUrl) : publicationJsonUrl;
console.log(publicationJsonUrl_);
const pathBase64 = publicationJsonUrl_.
    replace(/.*\/pub\/(.*)\/manifest.json/, "$1").
    replace("*-URL_LCP_PASS_PLACEHOLDER-*", ""); // lcpBeginToken + lcpEndToken
console.log(pathBase64);
const pathDecoded = window.atob(pathBase64);
console.log(pathDecoded);
const pathFileName = pathDecoded.substr(
    pathDecoded.replace(/\\/g, "/").lastIndexOf("/") + 1,
    pathDecoded.length - 1);
console.log(pathFileName);

// tslint:disable-next-line:no-string-literal
const lcpHint = queryParams["lcpHint"];

electronStore.onChanged("styling.night", (newValue: any, oldValue: any) => {
    if (typeof newValue === "undefined" || typeof oldValue === "undefined") {
        return;
    }

    const nightSwitch = document.getElementById("night_switch-input") as HTMLInputElement;
    nightSwitch.checked = newValue;

    // TODO DARK THEME
    // if (newValue) {
    //     document.body.classList.add("mdc-theme--dark");
    // } else {
    //     document.body.classList.remove("mdc-theme--dark");
    // }

    readiumCssOnOff();
});

electronStore.onChanged("styling.align", (newValue: any, oldValue: any) => {
    if (typeof newValue === "undefined" || typeof oldValue === "undefined") {
        return;
    }

    const nightSwitch = document.getElementById("justify_switch-input") as HTMLInputElement;
    nightSwitch.checked = (newValue === "justify");

    readiumCssOnOff();
});

electronStore.onChanged("styling.paged", (newValue: any, oldValue: any) => {
    if (typeof newValue === "undefined" || typeof oldValue === "undefined") {
        return;
    }

    const paginateSwitch = document.getElementById("paginate_switch-input") as HTMLInputElement;
    paginateSwitch.checked = newValue;

    readiumCssOnOff();
});

const readiumCssOnOff = debounce(() => {
    readiumCssOnOff_();
}, 500);

// super hacky, but necessary :(
// https://github.com/material-components/material-components-web/issues/1017#issuecomment-340068426
function ensureSliderLayout() {
    setTimeout(() => {
        const fontSizeSelector = document.getElementById("fontSizeSelector") as HTMLElement;
        (fontSizeSelector as any).mdcSlider.layout();

        const lineHeightSelector = document.getElementById("lineHeightSelector") as HTMLElement;
        (lineHeightSelector as any).mdcSlider.layout();
    }, 100);
}

electronStore.onChanged("styling.readiumcss", (newValue: any, oldValue: any) => {
    if (typeof newValue === "undefined" || typeof oldValue === "undefined") {
        return;
    }
    const stylingWrapper = document.getElementById("stylingWrapper") as HTMLElement;
    stylingWrapper.style.display = newValue ? "block" : "none";
    if (newValue) {
        ensureSliderLayout();
    }

    const readiumcssSwitch = document.getElementById("readiumcss_switch-input") as HTMLInputElement;
    readiumcssSwitch.checked = newValue;

    readiumCssOnOff();

    const justifySwitch = document.getElementById("justify_switch-input") as HTMLInputElement;
    justifySwitch.disabled = !newValue;

    const paginateSwitch = document.getElementById("paginate_switch-input") as HTMLInputElement;
    paginateSwitch.disabled = !newValue;

    const nightSwitch = document.getElementById("night_switch-input") as HTMLInputElement;
    nightSwitch.disabled = !newValue;
    if (!newValue) {
        electronStore.set("styling.night", false);
    }
});

electronStore.onChanged("basicLinkTitles", (newValue: any, oldValue: any) => {
    if (typeof newValue === "undefined" || typeof oldValue === "undefined") {
        return;
    }
    const basicSwitch = document.getElementById("nav_basic_switch-input") as HTMLInputElement;
    basicSwitch.checked = !newValue;
});

let snackBar: any;
let drawer: any;

window.onerror = (err) => {
    console.log("Error", err);
};

ipcRenderer.on(R2_EVENT_TRY_LCP_PASS_RES, (
    _event: any,
    payload: IEventPayload_R2_EVENT_TRY_LCP_PASS_RES) => {

    if (!payload.okay && payload.error) {
        let message: string;
        if (typeof payload.error === "string") {
            message = payload.error;
        } else {
            switch (payload.error as number) {
                case 0: {
                    message = "NONE: " + payload.error;
                    break;
                }
                case 1: {
                    message = "INCORRECT PASSPHRASE: " + payload.error;
                    break;
                }
                case 11: {
                    message = "LICENSE_OUT_OF_DATE: " + payload.error;
                    break;
                }
                case 101: {
                    message = "CERTIFICATE_REVOKED: " + payload.error;
                    break;
                }
                case 102: {
                    message = "CERTIFICATE_SIGNATURE_INVALID: " + payload.error;
                    break;
                }
                case 111: {
                    message = "LICENSE_SIGNATURE_DATE_INVALID: " + payload.error;
                    break;
                }
                case 112: {
                    message = "LICENSE_SIGNATURE_INVALID: " + payload.error;
                    break;
                }
                case 121: {
                    message = "CONTEXT_INVALID: " + payload.error;
                    break;
                }
                case 131: {
                    message = "CONTENT_KEY_DECRYPT_ERROR: " + payload.error;
                    break;
                }
                case 141: {
                    message = "USER_KEY_CHECK_INVALID: " + payload.error;
                    break;
                }
                case 151: {
                    message = "CONTENT_DECRYPT_ERROR: " + payload.error;
                    break;
                }
                default: {
                    message = "Unknown error?! " + payload.error;
                }
            }
        }

        setTimeout(() => {
            showLcpDialog(message);
        }, 500);

        // DRMErrorCode (from r2-lcp-client)
        // 1 === NO CORRECT PASSPHRASE / UERKEY IN GIVEN ARRAY
        //     // No error
        //     NONE = 0,
        //     /**
        //         WARNING ERRORS > 10
        //     **/
        //     // License is out of date (check start and end date)
        //     LICENSE_OUT_OF_DATE = 11,
        //     /**
        //         CRITICAL ERRORS > 100
        //     **/
        //     // Certificate has been revoked in the CRL
        //     CERTIFICATE_REVOKED = 101,
        //     // Certificate has not been signed by CA
        //     CERTIFICATE_SIGNATURE_INVALID = 102,
        //     // License has been issued by an expired certificate
        //     LICENSE_SIGNATURE_DATE_INVALID = 111,
        //     // License signature does not match
        //     LICENSE_SIGNATURE_INVALID = 112,
        //     // The drm context is invalid
        //     CONTEXT_INVALID = 121,
        //     // Unable to decrypt encrypted content key from user key
        //     CONTENT_KEY_DECRYPT_ERROR = 131,
        //     // User key check invalid
        //     USER_KEY_CHECK_INVALID = 141,
        //     // Unable to decrypt encrypted content from content key
        //     CONTENT_DECRYPT_ERROR = 151
        return;
    }

    if (payload.passSha256Hex) {
        const lcpStore = electronStoreLCP.get("lcp");
        if (!lcpStore) {
            const lcpObj: any = {};
            const pubLcpObj: any = lcpObj[pathDecoded] = {};
            pubLcpObj.sha = payload.passSha256Hex;

            electronStoreLCP.set("lcp", lcpObj);
        } else {
            const pubLcpStore = lcpStore[pathDecoded];
            if (pubLcpStore) {
                pubLcpStore.sha = payload.passSha256Hex;
            } else {
                lcpStore[pathDecoded] = {
                    sha: payload.passSha256Hex,
                };
            }
            electronStoreLCP.set("lcp", lcpStore);
        }

        if (publicationJsonUrl.indexOf("URL_LCP_PASS_PLACEHOLDER") > 0) {
            let pazz = Buffer.from(payload.passSha256Hex).toString("base64");
            pazz = encodeURIComponent_RFC3986(pazz);
            publicationJsonUrl = publicationJsonUrl.replace("URL_LCP_PASS_PLACEHOLDER", pazz);
            console.log(publicationJsonUrl);
        }
    }

    startNavigatorExperiment();
});

let lcpDialog: any;

function showLcpDialog(message?: string) {

    // dialog.lastFocusedTarget = evt.target;

    const lcpPassHint = document.getElementById("lcpPassHint") as HTMLElement;
    lcpPassHint.textContent = lcpHint;

    if (message) {
        const lcpPassMessage = document.getElementById("lcpPassMessage") as HTMLElement;
        lcpPassMessage.textContent = message;
    }

    lcpDialog.show();
    setTimeout(() => {
        const lcpPassInput = document.getElementById("lcpPassInput") as HTMLElement;
        lcpPassInput.focus();
        setTimeout(() => {
            lcpPassInput.classList.add("no-focus-outline");
        }, 500);
    }, 800);
}

function installKeyboardMouseFocusHandler() {
    let dateLastKeyboardEvent = new Date();
    let dateLastMouseEvent = new Date();

    // // DEBUG
    // document.body.addEventListener("focus", (ev: any) => {
    //     console.log("focus:");
    //     console.log(ev.target);
    //     if (ev.target.tagName.toLowerCase() === "webview") {
    //         console.log("preventing...");
    //         ev.preventDefault();
    //         ev.stopPropagation();
    //     }
    // }, true);
    // document.body.addEventListener("focusin", (ev: any) => {
    //     console.log("focusin:");
    //     console.log(ev.target);
    //     if (ev.target.tagName.toLowerCase() === "webview") {
    //         console.log("preventing...");
    //         ev.preventDefault();
    //         ev.stopPropagation();
    //     }
    // });
    // // DEBUG

    document.body.addEventListener("focusin", debounce((ev: any) => {
        const focusWasTriggeredByMouse = dateLastMouseEvent > dateLastKeyboardEvent;
        if (focusWasTriggeredByMouse) {
            if (ev.target && ev.target.classList) {
                ev.target.classList.add("no-focus-outline");
            }
        }
    }, 500));
    document.body.addEventListener("focusout", (ev: any) => {
        if (ev.target && ev.target.classList) {
            ev.target.classList.remove("no-focus-outline");
        }
    });
    document.body.addEventListener("mousedown", () => {
        dateLastMouseEvent = new Date();
    });
    document.body.addEventListener("keydown", () => {
        dateLastKeyboardEvent = new Date();
    });
}

const initLineHeightSelector = () => {

    const lineHeightSelector = document.getElementById("lineHeightSelector") as HTMLElement;
    const slider = new (window as any).mdc.slider.MDCSlider(lineHeightSelector);
    (lineHeightSelector as any).mdcSlider = slider;
    // const step = lineHeightSelector.getAttribute("data-step") as string;
    // console.log("step: " + step);
    // slider.step = parseFloat(step);
    // console.log("slider.step: " + slider.step);

    slider.disabled = !electronStore.get("styling.readiumcss");
    const val = electronStore.get("styling.lineHeight");
    if (val) {
        slider.value = parseFloat(val) * 100;
    } else {
        slider.value = 1.5 * 100;
    }

    // console.log(slider.min);
    // console.log(slider.max);
    // console.log(slider.value);
    // console.log(slider.step);

    electronStore.onChanged("styling.readiumcss", (newValue: any, oldValue: any) => {
        if (typeof newValue === "undefined" || typeof oldValue === "undefined") {
            return;
        }
        slider.disabled = !newValue;
    });

    // slider.listen("MDCSlider:input", (event: any) => {
    //     console.log(event.detail.value);
    // });
    slider.listen("MDCSlider:change", (event: any) => {
        electronStore.set("styling.lineHeight",
            "" + (event.detail.value / 100));
    });

    electronStore.onChanged("styling.lineHeight", (newValue: any, oldValue: any) => {
        if (typeof newValue === "undefined" || typeof oldValue === "undefined") {
            return;
        }

        slider.value = parseFloat(newValue) * 100;

        readiumCssOnOff();
    });
};

const initFontSizeSelector = () => {

    const fontSizeSelector = document.getElementById("fontSizeSelector") as HTMLElement;
    const slider = new (window as any).mdc.slider.MDCSlider(fontSizeSelector);
    (fontSizeSelector as any).mdcSlider = slider;

    // const drawerElement = document.getElementById("drawer") as HTMLElement;
    // const funcClose = () => {
    //     drawerElement.removeEventListener("MDCTemporaryDrawer:close", funcClose);
    //     console.log("MDCTemporaryDrawer:close");

    //     const funcOpen = () => {
    //         drawerElement.removeEventListener("MDCTemporaryDrawer:open", funcOpen);
    //         console.log("MDCTemporaryDrawer:open");

    //         setTimeout(() => {
    //             console.log("SLIDER LAYOUT");
    //             slider.layout();
    //         }, 1000);
    //     };
    //     drawerElement.addEventListener("MDCTemporaryDrawer:open", funcOpen);
    // };
    // drawerElement.addEventListener("MDCTemporaryDrawer:close", funcClose);

    slider.disabled = !electronStore.get("styling.readiumcss");
    const val = electronStore.get("styling.fontSize");
    if (val) {
        slider.value = parseInt(val.replace("%", ""), 10);
    } else {
        slider.value = 100;
    }

    // console.log(slider.min);
    // console.log(slider.max);
    // console.log(slider.value);
    // console.log(slider.step);

    electronStore.onChanged("styling.readiumcss", (newValue: any, oldValue: any) => {
        if (typeof newValue === "undefined" || typeof oldValue === "undefined") {
            return;
        }
        slider.disabled = !newValue;
    });

    // slider.listen("MDCSlider:input", (event: any) => {
    //     console.log(event.detail.value);
    // });
    slider.listen("MDCSlider:change", (event: any) => {
        // console.log(event.detail.value);
        electronStore.set("styling.fontSize", event.detail.value + "%");
    });

    electronStore.onChanged("styling.fontSize", (newValue: any, oldValue: any) => {
        if (typeof newValue === "undefined" || typeof oldValue === "undefined") {
            return;
        }

        slider.value = parseInt(newValue.replace("%", ""), 10);

        readiumCssOnOff();
    });
};

const initFontSelector = () => {

    const ID_PREFIX = "fontselect_";

    const options: IRiotOptsMenuSelectItem[] =
        [{
            id: ID_PREFIX + "DEFAULT",
            label: "Default font",
        }, {
            id: ID_PREFIX + "OLD",
            label: "Old Style",
            style: "font-family: \"Iowan Old Style\", \"Sitka Text\", Palatino, \"Book Antiqua\", serif;",
        }, {
            id: ID_PREFIX + "MODERN",
            label: "Modern",
            style: "font-family: Athelas, Constantia, Georgia, serif;",
        }, {
            id: ID_PREFIX + "SANS",
            label: "Sans",
            style: "font-family: -apple-system, system-ui, BlinkMacSystemFont," +
                " \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif;",
        }, {
            id: ID_PREFIX + "HUMAN",
            label: "Humanist",
            style: "font-family: Seravek, Calibri, Roboto, Arial, sans-serif;",
        }, {
            id: ID_PREFIX + "DYS",
            label: "Readable (dys)",
            style: "font-family: AccessibleDfa;",
        }, {
            id: ID_PREFIX + "DUO",
            label: "Duospace",
            style: "font-family: \"IA Writer Duospace\", Consolas, monospace;",
        }, {
            id: ID_PREFIX + "MONO",
            label: "Monospace",
            style: "font-family: \"Andale Mono\", Consolas, monospace;",
        }];
    let selectedID = ID_PREFIX + electronStore.get("styling.font");
    const foundItem = options.find((item) => {
        return item.id === selectedID;
    });
    if (!foundItem) {
        selectedID = options[0].id;
    }
    const opts: IRiotOptsMenuSelect = {
        disabled: !electronStore.get("styling.readiumcss"),
        label: "Font name",
        options,
        selected: selectedID,
    };
    const tag = riotMountMenuSelect("#fontSelect", opts)[0] as IRiotTagMenuSelect;

    tag.on("selectionChanged", (val: string) => {
        // console.log("selectionChanged");
        // console.log(val);
        // const element = tag.root.ownerDocument.getElementById(val) as HTMLElement;
        //     console.log(element.textContent);
        val = val.replace(ID_PREFIX, "");
        // console.log(val);
        electronStore.set("styling.font", val);
    });

    electronStore.onChanged("styling.font", (newValue: any, oldValue: any) => {
        if (typeof newValue === "undefined" || typeof oldValue === "undefined") {
            return;
        }
        // console.log("onDidChange");
        // console.log(newValue);
        tag.setSelectedItem(ID_PREFIX + newValue);

        readiumCssOnOff();
    });

    electronStore.onChanged("styling.readiumcss", (newValue: any, oldValue: any) => {
        if (typeof newValue === "undefined" || typeof oldValue === "undefined") {
            return;
        }
        tag.setDisabled(!newValue);
    });

    setTimeout(async () => {

        let _sysFonts: string[] = [];
        const systemFonts = new SystemFonts.default();
        // const sysFonts = systemFonts.getFontsSync();
        try {
            _sysFonts = await systemFonts.getFonts();
            // console.log(_sysFonts);
        } catch (err) {
            console.log(err);
        }
        if (_sysFonts && _sysFonts.length) {
            const arr = ((tag.opts as IRiotOptsMenuSelect).options as IRiotOptsMenuSelectItem[]);
            const divider: IRiotOptsMenuSelectItem = {
                id: ID_PREFIX + "_",
                label: "_",
            };
            arr.push(divider);
            _sysFonts.forEach((sysFont) => {
                const option: IRiotOptsMenuSelectItem = {
                    id: ID_PREFIX + sysFont, // .replace(/ /g, "_"),
                    label: sysFont,
                    style: "font-family: " + sysFont + ";",
                };
                arr.push(option);
            });
            let newSelectedID = ID_PREFIX + electronStore.get("styling.font");
            const newFoundItem = options.find((item) => {
                return item.id === newSelectedID;
            });
            if (!newFoundItem) {
                newSelectedID = arr[0].id;
            }
            (tag.opts as IRiotOptsMenuSelect).selected = newSelectedID;
            tag.update();
        }
    }, 100);
};

// window.addEventListener("load", () => {
// });

window.addEventListener("DOMContentLoaded", () => {

    (window as any).mdc.menu.MDCMenuFoundation.numbers.TRANSITION_DURATION_MS = 200;

    // TODO this seems to hijack MDC slider thumb change
    window.document.addEventListener("keydown", (ev: KeyboardEvent) => {
        if (drawer.open) {
            return;
        }
        if ((ev.target as any).mdcSlider) {
            return;
        }

        if (ev.keyCode === 37) { // left
            navLeftOrRight(true);
        } else if (ev.keyCode === 39) { // right
            navLeftOrRight(false);
        }
    });

    setTimeout(() => {
        // material-components-web
        (window as any).mdc.autoInit();
    }, 500);

    window.document.title = "Readium2 [ " + pathFileName + "]";

    const h1 = document.getElementById("pubTitle") as HTMLElement;
    h1.textContent = pathFileName;

    installKeyboardMouseFocusHandler();

    // TODO DARK THEME
    // if (electronStore.get("styling.night")) {
    //     document.body.classList.add("mdc-theme--dark");
    // } else {
    //     document.body.classList.remove("mdc-theme--dark");
    // }

    const drawerElement = document.getElementById("drawer") as HTMLElement;
    drawer = new (window as any).mdc.drawer.MDCTemporaryDrawer(drawerElement);
    (drawerElement as any).mdcTemporaryDrawer = drawer;
    const drawerButton = document.getElementById("drawerButton") as HTMLElement;
    drawerButton.addEventListener("click", () => {
        drawer.open = true;
    });
    // drawerElement.addEventListener("click", (ev) => {
    //     const allMenus = drawerElement.querySelectorAll(".mdc-menu");
    //     const openedMenus: Node[] = [];
    //     allMenus.forEach((elem) => {
    //         if ((elem as any).mdcSimpleMenu && (elem as any).mdcSimpleMenu.open) {
    //             openedMenus.push(elem);
    //         }
    //     });

    //     let needsToCloseMenus = true;
    //     let currElem: Node | null = ev.target as Node;
    //     while (currElem) {
    //         if (openedMenus.indexOf(currElem) >= 0) {
    //             needsToCloseMenus = false;
    //             break;
    //         }
    //         currElem = currElem.parentNode;
    //     }
    //     if (needsToCloseMenus) {
    //         openedMenus.forEach((elem) => {
    //             (elem as any).mdcSimpleMenu.open = false;
    //             let ss = (elem.parentNode as HTMLElement).querySelector(".mdc-select__selected-text");
    //             if (ss) {
    //                 (ss as HTMLElement).style.transform = "initial";
    //                 (ss as HTMLElement).style.opacity = "1";
    //                 (ss as HTMLElement).focus();
    //             }
    //             ss = (elem.parentNode as HTMLElement).querySelector(".mdc-select__label");
    //             if (ss) {
    //                 (ss as HTMLElement).style.transform = "initial";
    //                 (ss as HTMLElement).style.opacity = "1";
    //                 (ss as HTMLElement).focus();
    //             }
    //         });
    //     } else {
    //         console.log("NOT CLOSING MENU");
    //     }
    // }, true);

    initFontSelector();
    initFontSizeSelector();
    initLineHeightSelector();

    const nightSwitch = document.getElementById("night_switch-input") as HTMLInputElement;
    nightSwitch.checked = electronStore.get("styling.night");
    nightSwitch.addEventListener("change", (_event) => {
        const checked = nightSwitch.checked;
        electronStore.set("styling.night", checked);
    });
    nightSwitch.disabled = !electronStore.get("styling.readiumcss");

    const justifySwitch = document.getElementById("justify_switch-input") as HTMLInputElement;
    justifySwitch.checked = electronStore.get("styling.align") === "justify";
    justifySwitch.addEventListener("change", (_event) => {
        const checked = justifySwitch.checked;
        electronStore.set("styling.align", checked ? "justify" : "initial");
    });
    justifySwitch.disabled = !electronStore.get("styling.readiumcss");

    const paginateSwitch = document.getElementById("paginate_switch-input") as HTMLInputElement;
    paginateSwitch.checked = electronStore.get("styling.paged");
    paginateSwitch.addEventListener("change", (_event) => {
        const checked = paginateSwitch.checked;
        electronStore.set("styling.paged", checked);
    });
    paginateSwitch.disabled = !electronStore.get("styling.readiumcss");

    const readiumcssSwitch = document.getElementById("readiumcss_switch-input") as HTMLInputElement;
    readiumcssSwitch.checked = electronStore.get("styling.readiumcss");
    const stylingWrapper = document.getElementById("stylingWrapper") as HTMLElement;
    stylingWrapper.style.display = readiumcssSwitch.checked ? "block" : "none";
    if (readiumcssSwitch.checked) {
        ensureSliderLayout();
    }
    readiumcssSwitch.addEventListener("change", (_event) => {
        const checked = readiumcssSwitch.checked;
        electronStore.set("styling.readiumcss", checked);
    });

    const basicSwitch = document.getElementById("nav_basic_switch-input") as HTMLInputElement;
    basicSwitch.checked = !electronStore.get("basicLinkTitles");
    basicSwitch.addEventListener("change", (_event) => {
        const checked = basicSwitch.checked;
        electronStore.set("basicLinkTitles", !checked);
    });

    const snackBarElem = document.getElementById("snackbar") as HTMLElement;
    snackBar = new (window as any).mdc.snackbar.MDCSnackbar(snackBarElem);
    (snackBarElem as any).mdcSnackbar = snackBar;
    snackBar.dismissesOnAction = true;

    //     drawerElement.addEventListener("MDCTemporaryDrawer:open", () => {
    //         console.log("MDCTemporaryDrawer:open");
    //     });
    //     drawerElement.addEventListener("MDCTemporaryDrawer:close", () => {
    //         console.log("MDCTemporaryDrawer:close");
    //     });

    const menuFactory = (menuEl: HTMLElement) => {
        const menu = new (window as any).mdc.menu.MDCMenu(menuEl);
        (menuEl as any).mdcSimpleMenu = menu;
        return menu;
    };

    const selectElement = document.getElementById("nav-select") as HTMLElement;
    const navSelector = new (window as any).mdc.select.MDCSelect(selectElement, undefined, menuFactory);
    (selectElement as any).mdcSelect = navSelector;
    navSelector.listen("MDCSelect:change", (ev: any) => {
        // console.log("MDCSelect:change");
        // console.log(ev);
        // console.log(ev.detail.selectedOptions[0].textContent);
        // console.log(ev.detail.selectedIndex);
        // console.log(ev.detail.value);

        const activePanel = document.querySelector(".tabPanel.active");
        if (activePanel) {
            activePanel.classList.remove("active");
        }
        const newActivePanel = document.querySelector(".tabPanel:nth-child(" + (ev.detail.selectedIndex + 1) + ")");
        if (newActivePanel) {
            newActivePanel.classList.add("active");

            const div = document.getElementById("reader_controls_STYLES") as HTMLElement;
            if (newActivePanel === div) {
                ensureSliderLayout();
            }
        }
    });

    const diagElem = document.querySelector("#lcpDialog");
    const lcpPassInput = document.getElementById("lcpPassInput") as HTMLInputElement;
    lcpDialog = new (window as any).mdc.dialog.MDCDialog(diagElem);
    (diagElem as any).mdcDialog = lcpDialog;
    lcpDialog.listen("MDCDialog:accept", () => {

        const lcpPass = lcpPassInput.value;

        const payload: IEventPayload_R2_EVENT_TRY_LCP_PASS = {
            isSha256Hex: false,
            lcpPass,
            publicationFilePath: pathDecoded,
        };
        ipcRenderer.send(R2_EVENT_TRY_LCP_PASS, payload);
    });
    lcpDialog.listen("MDCDialog:cancel", () => {

        setTimeout(() => {
            showLcpDialog();
        }, 10);
    });
    if (lcpPassInput) {
        lcpPassInput.addEventListener("keyup", (ev) => {
            if (ev.keyCode === 13) {
                ev.preventDefault();
                const lcpDialogAcceptButton = document.getElementById("lcpDialogAcceptButton") as HTMLElement;
                lcpDialogAcceptButton.click();
            }
        });
    }

    if (lcpHint) {

        let lcpPassSha256Hex: string | undefined;
        const lcpStore = electronStoreLCP.get("lcp");
        if (lcpStore) {
            const pubLcpStore = lcpStore[pathDecoded];
            if (pubLcpStore && pubLcpStore.sha) {
                lcpPassSha256Hex = pubLcpStore.sha;
            }
        }
        if (lcpPassSha256Hex) {
            const payload: IEventPayload_R2_EVENT_TRY_LCP_PASS = {
                isSha256Hex: true,
                lcpPass: lcpPassSha256Hex,
                publicationFilePath: pathDecoded,
            };
            ipcRenderer.send(R2_EVENT_TRY_LCP_PASS, payload);
        } else {
            showLcpDialog();
        }
    } else {
        startNavigatorExperiment();
    }

    const buttonClearReadingLocations = document.getElementById("buttonClearReadingLocations") as HTMLElement;
    buttonClearReadingLocations.addEventListener("click", () => {
        electronStore.set("readingLocation", {});

        drawer.open = false;
        setTimeout(() => {
            const message = "Reading locations reset.";
            const data = {
                actionHandler: () => {
                    // console.log("SnackBar OK");
                },
                actionOnBottom: false,
                actionText: "OK",
                message,
                multiline: false,
                timeout: 2000,
            };
            snackBar.show(data);
        }, 500);
    });

    const buttonClearSettings = document.getElementById("buttonClearSettings") as HTMLElement;
    buttonClearSettings.addEventListener("click", () => {
        // electronStore.clear();
        // electronStore.store = electronStore.getDefaults();
        electronStore.set(undefined, electronStore.getDefaults());

        drawer.open = false;
        setTimeout(() => {
            const message = "Settings reset.";
            const data = {
                actionHandler: () => {
                    // console.log("SnackBar OK");
                },
                actionOnBottom: false,
                actionText: "OK",
                message,
                multiline: false,
                timeout: 2000,
            };
            snackBar.show(data);
        }, 500);
    });

    const buttonClearSettingsStyle = document.getElementById("buttonClearSettingsStyle") as HTMLElement;
    buttonClearSettingsStyle.addEventListener("click", () => {

        electronStore.set("styling", electronStore.getDefaults().styling);

        drawer.open = false;
        setTimeout(() => {
            const message = "Default styles.";
            const data = {
                actionHandler: () => {
                    // console.log("SnackBar OK");
                },
                actionOnBottom: false,
                actionText: "OK",
                message,
                multiline: false,
                timeout: 2000,
            };
            snackBar.show(data);
        }, 500);
    });

    const buttonOpenSettings = document.getElementById("buttonOpenSettings") as HTMLElement;
    buttonOpenSettings.addEventListener("click", () => {
        if ((electronStore as any).reveal) {
            (electronStore as any).reveal();
        }
        if ((electronStoreLCP as any).reveal) {
            (electronStoreLCP as any).reveal();
        }
    });

    const buttonLSDRenew = document.getElementById("buttonLSDRenew") as HTMLElement;
    buttonLSDRenew.addEventListener("click", () => {
        const payload: IEventPayload_R2_EVENT_LCP_LSD_RENEW = {
            endDateStr: undefined, // no explicit end date
            publicationFilePath: pathDecoded,
        };
        ipcRenderer.send(R2_EVENT_LCP_LSD_RENEW, payload);
    });

    const buttonLSDReturn = document.getElementById("buttonLSDReturn") as HTMLElement;
    buttonLSDReturn.addEventListener("click", () => {
        const payload: IEventPayload_R2_EVENT_LCP_LSD_RETURN = {
            publicationFilePath: pathDecoded,
        };
        ipcRenderer.send(R2_EVENT_LCP_LSD_RETURN, payload);
    });

    // const buttonDevTools = document.getElementById("buttonDevTools") as HTMLElement;
    //     buttonDevTools.addEventListener("click", () => {
    //         ipcRenderer.send(R2_EVENT_DEVTOOLS, "test");
    //     });
});

ipcRenderer.on(R2_EVENT_LCP_LSD_RENEW_RES, (_event: any, payload: IEventPayload_R2_EVENT_LCP_LSD_RENEW_RES) => {
    console.log("R2_EVENT_LCP_LSD_RENEW_RES");
    console.log(payload.okay);
    console.log(payload.error);
    console.log(payload.lsdJson);
});

ipcRenderer.on(R2_EVENT_LCP_LSD_RETURN_RES, (_event: any, payload: IEventPayload_R2_EVENT_LCP_LSD_RETURN_RES) => {
    console.log("R2_EVENT_LCP_LSD_RETURN_RES");
    console.log(payload.okay);
    console.log(payload.error);
    console.log(payload.lsdJson);
});

function startNavigatorExperiment() {

    const drawerButton = document.getElementById("drawerButton") as HTMLElement;
    drawerButton.focus();

    // tslint:disable-next-line:no-floating-promises
    (async () => {

        let response: Response;
        try {
            response = await fetch(publicationJsonUrl);
        } catch (e) {
            console.log(e);
            return;
        }
        if (!response.ok) {
            console.log("BAD RESPONSE?!");
        }
        // response.headers.forEach((arg0: any, arg1: any) => {
        //     console.log(arg0 + " => " + arg1);
        // });

        let _publicationJSON: any | undefined;
        try {
            _publicationJSON = await response.json();
        } catch (e) {
            console.log(e);
        }
        if (!_publicationJSON) {
            return;
        }
        // const pubJson = global.JSON.parse(publicationStr);

        // let _publication: Publication | undefined;
        const _publication = TAJSON.deserialize<Publication>(_publicationJSON, Publication);

        if (_publication.Metadata && _publication.Metadata.Title) {
            let title: string | undefined;
            if (typeof _publication.Metadata.Title === "string") {
                title = _publication.Metadata.Title;
            } else {
                const keys = Object.keys(_publication.Metadata.Title as IStringMap);
                if (keys && keys.length) {
                    title = (_publication.Metadata.Title as IStringMap)[keys[0]];
                }
            }

            if (title) {
                const h1 = document.getElementById("pubTitle") as HTMLElement;
                h1.textContent = title;
            }
        }

        const buttonNavLeft = document.getElementById("buttonNavLeft") as HTMLElement;
        buttonNavLeft.addEventListener("click", (_event) => {
            navLeftOrRight(true);
        });

        const buttonNavRight = document.getElementById("buttonNavRight") as HTMLElement;
        buttonNavRight.addEventListener("click", (_event) => {
            navLeftOrRight(false);
        });

        if (_publication.Spine && _publication.Spine.length) {

            const opts: IRiotOptsLinkList = {
                basic: true,
                fixBasic: true, // always single-line list items (no title)
                handleLink: handleLink_,
                links: _publicationJSON.spine as IRiotOptsLinkListItem[],
                url: publicationJsonUrl,
            };
            // const tag =
            riotMountLinkList("#reader_controls_SPINE", opts);
        }

        if (_publication.TOC && _publication.TOC.length) {

            const opts: IRiotOptsLinkTree = {
                basic: electronStore.get("basicLinkTitles"),
                handleLink: handleLink_,
                links: _publicationJSON.toc as IRiotOptsLinkTreeItem[],
                url: publicationJsonUrl,
            };
            const tag = riotMountLinkTree("#reader_controls_TOC", opts)[0] as IRiotTagLinkTree;

            electronStore.onChanged("basicLinkTitles", (newValue: any, oldValue: any) => {
                if (typeof newValue === "undefined" || typeof oldValue === "undefined") {
                    return;
                }
                tag.setBasic(newValue);
            });
        }
        if (_publication.PageList && _publication.PageList.length) {

            const opts: IRiotOptsLinkList = {
                basic: electronStore.get("basicLinkTitles"),
                handleLink: handleLink_,
                links: _publicationJSON["page-list"] as IRiotOptsLinkListItem[],
                url: publicationJsonUrl,
            };
            const tag = riotMountLinkList("#reader_controls_PAGELIST", opts)[0] as IRiotTagLinkList;

            electronStore.onChanged("basicLinkTitles", (newValue: any, oldValue: any) => {
                if (typeof newValue === "undefined" || typeof oldValue === "undefined") {
                    return;
                }
                tag.setBasic(newValue);
            });
        }

        const landmarksData: IRiotOptsLinkListGroupItem[] = [];
        if (_publication.Landmarks && _publication.Landmarks.length) {
            landmarksData.push({
                label: "Main",
                links: _publicationJSON.landmarks as IRiotOptsLinkListItem[],
            });
        }
        if (_publication.LOT && _publication.LOT.length) {
            landmarksData.push({
                label: "Tables",
                links: _publicationJSON.lot as IRiotOptsLinkListItem[],
            });
        }
        if (_publication.LOI && _publication.LOI.length) {
            landmarksData.push({
                label: "Illustrations",
                links: _publicationJSON.loi as IRiotOptsLinkListItem[],
            });
        }
        if (_publication.LOV && _publication.LOV.length) {
            landmarksData.push({
                label: "Video",
                links: _publicationJSON.lov as IRiotOptsLinkListItem[],
            });
        }
        if (_publication.LOA && _publication.LOA.length) {
            landmarksData.push({
                label: "Audio",
                links: _publicationJSON.loa as IRiotOptsLinkListItem[],
            });
        }
        if (landmarksData.length) {
            const opts: IRiotOptsLinkListGroup = {
                basic: electronStore.get("basicLinkTitles"),
                handleLink: handleLink_,
                linksgroup: landmarksData,
                url: publicationJsonUrl,
            };
            const tag = riotMountLinkListGroup("#reader_controls_LANDMARKS", opts)[0] as IRiotTagLinkListGroup;

            electronStore.onChanged("basicLinkTitles", (newValue: any, oldValue: any) => {
                if (typeof newValue === "undefined" || typeof oldValue === "undefined") {
                    return;
                }
                tag.setBasic(newValue);
            });
        }

        const readStore = electronStore.get("readingLocation");
        let pubDocHrefToLoad: string | undefined;
        let pubDocSelectorToGoto: string | undefined;
        if (readStore) {
            const obj = readStore[pathDecoded];
            if (obj && obj.doc) {
                pubDocHrefToLoad = obj.doc;
                if (obj.loc) {
                    pubDocSelectorToGoto = obj.loc;
                }
            }
        }

        // necessary otherwise focus steal for links in publication documents!
        drawer.open = true;
        setTimeout(() => {
            drawer.open = false;

            let preloadPath = "./preload.js";

            // TODO: REEEALLY HACKY! (and does not work in release bundle mode, only with dist/ exploded code)
            let distTarget: string | undefined;
            const dirnameSlashed = __dirname.replace(/\\/g, "/");
            if (dirnameSlashed.indexOf("/dist/es5") > 0) {
                distTarget = "es5";
            } else if (dirnameSlashed.indexOf("/dist/es6-es2015") > 0) {
                distTarget = "es6-es2015";
            } else if (dirnameSlashed.indexOf("/dist/es7-es2016") > 0) {
                distTarget = "es7-es2016";
            } else if (dirnameSlashed.indexOf("/dist/es8-es2017") > 0) {
                distTarget = "es8-es2017";
            }
            if (distTarget) {
                preloadPath = path.join(process.cwd(),
                    "node_modules/r2-navigator-js/dist/" +
                    distTarget
                    + "/src/electron/renderer/webview/preload.js");
            }

            preloadPath = IS_DEV ? preloadPath : `${dirnameSlashed}/preload.js`;
            preloadPath = preloadPath.replace(/\\/g, "/");
            // preloadPath = "file://" + preloadPath;
            console.log(preloadPath);

            const rootHtmlElementID = "publication_viewport";
            const rootHtmlElement = document.getElementById(rootHtmlElementID) as HTMLElement;
            if (!rootHtmlElement) {
                console.log("!rootHtmlElement ???");
                return;
            }

            rootHtmlElement.addEventListener(DOM_EVENT_HIDE_VIEWPORT, () => {
                hideWebView();
            });
            rootHtmlElement.addEventListener(DOM_EVENT_SHOW_VIEWPORT, () => {
                unhideWebView();
            });

            installNavigatorDOM(_publication, publicationJsonUrl,
                rootHtmlElementID,
                preloadPath,
                pubDocHrefToLoad, pubDocSelectorToGoto);
        }, 500);
    })();
}

const ELEMENT_ID_HIDE_PANEL = "r2_navigator_reader_chrome_HIDE";
let _viewHideInterval: NodeJS.Timer | undefined;
const unhideWebView = () => {
    if (_viewHideInterval) {
        clearInterval(_viewHideInterval);
        _viewHideInterval = undefined;
    }
    const hidePanel = document.getElementById(ELEMENT_ID_HIDE_PANEL) as HTMLElement;
    if (!hidePanel || hidePanel.style.display === "none") {
        return;
    }
    if (hidePanel) {
        hidePanel.style.display = "none";
    }
};
const hideWebView = () => {
    const hidePanel = document.getElementById(ELEMENT_ID_HIDE_PANEL) as HTMLElement;
    if (hidePanel && hidePanel.style.display !== "block") {
        hidePanel.style.display = "block";
        _viewHideInterval = setInterval(() => {
            console.log("unhideWebView FORCED");
            unhideWebView();
        }, 5000);
    }
};

function handleLink_(href: string) {
    if (drawer.open) {
        drawer.open = false;
        setTimeout(() => {
            handleLink(href, undefined, false);
        }, 200);
    } else {
        handleLink(href, undefined, false);
    }
}
