/******/ (() => { // webpackBootstrap
/******/ 	"use strict";

;// ../../node_modules/uuid/dist/esm-browser/native.js
const randomUUID = typeof crypto !== 'undefined' && crypto.randomUUID && crypto.randomUUID.bind(crypto);
/* harmony default export */ const esm_browser_native = ({
  randomUUID
});
;// ../../node_modules/uuid/dist/esm-browser/rng.js
// Unique ID creation requires a high quality random # generator. In the browser we therefore
// require the crypto API and do not support built-in fallback to lower quality random number
// generators (like Math.random()).
let getRandomValues;
const rnds8 = new Uint8Array(16);
function rng() {
  // lazy load so that environments that need to polyfill have a chance to do so
  if (!getRandomValues) {
    // getRandomValues needs to be invoked in a context where "this" is a Crypto implementation.
    getRandomValues = typeof crypto !== 'undefined' && crypto.getRandomValues && crypto.getRandomValues.bind(crypto);

    if (!getRandomValues) {
      throw new Error('crypto.getRandomValues() not supported. See https://github.com/uuidjs/uuid#getrandomvalues-not-supported');
    }
  }

  return getRandomValues(rnds8);
}
;// ../../node_modules/uuid/dist/esm-browser/stringify.js

/**
 * Convert array of 16 byte values to UUID string format of the form:
 * XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
 */

const byteToHex = [];

for (let i = 0; i < 256; ++i) {
  byteToHex.push((i + 0x100).toString(16).slice(1));
}

function unsafeStringify(arr, offset = 0) {
  // Note: Be careful editing this code!  It's been tuned for performance
  // and works in ways you may not expect. See https://github.com/uuidjs/uuid/pull/434
  return byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + '-' + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + '-' + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + '-' + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + '-' + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]];
}

function stringify(arr, offset = 0) {
  const uuid = unsafeStringify(arr, offset); // Consistency check for valid UUID.  If this throws, it's likely due to one
  // of the following:
  // - One or more input array values don't map to a hex octet (leading to
  // "undefined" in the uuid)
  // - Invalid input values for the RFC `version` or `variant` fields

  if (!validate(uuid)) {
    throw TypeError('Stringified UUID is invalid');
  }

  return uuid;
}

/* harmony default export */ const esm_browser_stringify = ((/* unused pure expression or super */ null && (stringify)));
;// ../../node_modules/uuid/dist/esm-browser/v4.js




function v4(options, buf, offset) {
  if (esm_browser_native.randomUUID && !buf && !options) {
    return esm_browser_native.randomUUID();
  }

  options = options || {};
  const rnds = options.random || (options.rng || rng)(); // Per 4.4, set bits for version and `clock_seq_hi_and_reserved`

  rnds[6] = rnds[6] & 0x0f | 0x40;
  rnds[8] = rnds[8] & 0x3f | 0x80; // Copy bytes to buffer, if provided

  if (buf) {
    offset = offset || 0;

    for (let i = 0; i < 16; ++i) {
      buf[offset + i] = rnds[i];
    }

    return buf;
  }

  return unsafeStringify(rnds);
}

/* harmony default export */ const esm_browser_v4 = (v4);
;// ../../node_modules/@eyeo/snippets/webext/main.mjs
/*!
 * This file is part of eyeo's Anti-Circumvention Snippets module (@eyeo/snippets),
 * Copyright (C) 2006-present eyeo GmbH
 * 
 * @eyeo/snippets is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 * 
 * @eyeo/snippets is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with @eyeo/snippets.  If not, see <http://www.gnu.org/licenses/>.
 */

let currentEnvironment = {initial: true};
const callback = (environment, ...filters) => {
const e=Proxy,{apply:t,bind:r,call:n}=Function,o=n.bind(t),s=n.bind(r),i=n.bind(n),a={get:(e,t)=>s(n,e[t])},c=t=>new e(t,a),l=(t,r)=>new e(t,{apply:(e,t,n)=>o(r,t,n)}),u={get:(e,t)=>s(e[t],e)},p=t=>new e(t,u),{assign:f,defineProperties:d,freeze:h,getOwnPropertyDescriptor:g,getOwnPropertyDescriptors:y,getPrototypeOf:w}=p(Object),{hasOwnProperty:m}=c({}),{species:v}=Symbol,b={get(e,t){const r=e[t];class n extends r{}const o=y(r.prototype);delete o.constructor,h(d(n.prototype,o));const s=y(r);return delete s.length,delete s.prototype,s[v]={value:n},h(d(n,s))}},E=t=>new e(t,b);"undefined"!=typeof currentEnvironment&&currentEnvironment.initial&&"undefined"!=typeof environment&&(currentEnvironment=environment);const $=()=>"undefined"!=typeof currentEnvironment?currentEnvironment:"undefined"!=typeof environment?environment:{};"undefined"==typeof globalThis&&(window.globalThis=window);const{apply:S,ownKeys:T}=p(Reflect),j=$(),k="world"in j,x=k&&"ISOLATED"===j.world,R=k&&"MAIN"===j.world,P="object"==typeof chrome&&!!chrome.runtime,A="object"==typeof browser&&!!browser.runtime,O=!R&&(x||P||A),L=e=>O?e:M(e,F(e)),{create:M,defineProperties:N,defineProperty:I,freeze:C,getOwnPropertyDescriptor:W,getOwnPropertyDescriptors:F}=p(Object),D=p(globalThis),H=O?globalThis:E(globalThis),{Map:J,RegExp:q,Set:B,WeakMap:z,WeakSet:_}=H,U=(e,t,r=null)=>{const n=T(t);for(const o of T(e)){if(n.includes(o))continue;const s=W(e,o);if(r&&"value"in s){const{value:e}=s;"function"==typeof e&&(s.value=r(e))}I(t,o,s)}},V=e=>{const t=H[e];class r extends t{}const{toString:n,valueOf:o}=t.prototype;N(r.prototype,{toString:{value:n},valueOf:{value:o}});const s=e.toLowerCase(),i=e=>function(){const t=S(e,this,arguments);return typeof t===s?new r(t):t};return U(t,r,i),U(t.prototype,r.prototype,i),r},X=C({frozen:new z,hidden:new _,iframePropertiesToAbort:{read:new B,write:new B},abortedIframes:new z}),G=new q("^[A-Z]"),K=O&&(P&&chrome||A&&browser)||void 0;var Q=new Proxy(new J([["chrome",K],["browser",K],["isExtensionContext",O],["variables",X],["console",L(console)],["document",globalThis.document],["JSON",L(JSON)],["Map",J],["Math",L(Math)],["Number",O?Number:V("Number")],["RegExp",q],["Set",B],["String",O?String:V("String")],["WeakMap",z],["WeakSet",_],["MouseEvent",MouseEvent]]),{get(e,t){if(e.has(t))return e.get(t);let r=globalThis[t];return"function"==typeof r&&(r=(G.test(t)?H:D)[t]),e.set(t,r),r},has:(e,t)=>e.has(t)});const Y={WeakSet:WeakSet,WeakMap:WeakMap,WeakValue:class{has(){return!1}set(){}}},{apply:Z}=Reflect;const{Map:ee,WeakMap:te,WeakSet:re,setTimeout:ne}=Q;let oe=!0,se=e=>{e.clear(),oe=!oe};var ie=function(e){const{WeakSet:t,WeakMap:r,WeakValue:n}=this||Y,o=new t,s=new r,i=new n;return function(t){if(o.has(t))return t;if(s.has(t))return s.get(t);if(i.has(t))return i.get(t);const r=Z(e,this,arguments);return o.add(r),r!==t&&("object"==typeof t&&t?s:i).set(t,r),r}}.bind({WeakMap:te,WeakSet:re,WeakValue:class extends ee{set(e,t){return oe&&(oe=!oe,ne(se,0,this)),super.set(e,t)}}});const{concat:ae,includes:ce,join:le,reduce:ue,unshift:pe}=c([]),{Map:fe,WeakMap:de}=E(globalThis),he=new fe,ge=e=>{const t=(e=>{const t=[];let r=e;for(;r;){if(he.has(r))pe(t,he.get(r));else{const e=y(r);he.set(r,e),pe(t,e)}r=w(r)}return pe(t,{}),o(f,null,t)})("function"==typeof e?e.prototype:e),r={get(e,r){if(r in t){const{value:n,get:o}=t[r];if(o)return i(o,e);if("function"==typeof n)return s(n,e)}return e[r]},set(e,r,n){if(r in t){const{set:o}=t[r];if(o)return i(o,e,n),!0}return e[r]=n,!0}};return e=>new Proxy(e,r)},{isExtensionContext:ye,Array:we,Number:me,String:ve,Object:be}=Q,{isArray:Ee}=we,{getOwnPropertyDescriptor:$e,setPrototypeOf:Se}=be,{toString:Te}=be.prototype,{slice:je}=ve.prototype,{get:ke}=$e(Node.prototype,"nodeType"),xe=ye?{}:{Attr:ge(Attr),CanvasRenderingContext2D:ge(CanvasRenderingContext2D),CSSStyleDeclaration:ge(CSSStyleDeclaration),Document:ge(Document),Element:ge(Element),HTMLCanvasElement:ge(HTMLCanvasElement),HTMLElement:ge(HTMLElement),HTMLImageElement:ge(HTMLImageElement),HTMLScriptElement:ge(HTMLScriptElement),MutationRecord:ge(MutationRecord),Node:ge(Node),ShadowRoot:ge(ShadowRoot),get CSS2Properties(){return xe.CSSStyleDeclaration}},Re=(e,t)=>{if("Element"!==t&&t in xe)return xe[t](e);if(Ee(e))return Se(e,we.prototype);const r=(e=>i(je,i(Te,e),8,-1))(e);if(r in xe)return xe[r](e);if(r in Q)return Se(e,Q[r].prototype);if("nodeType"in e)switch(i(ke,e)){case 1:if(!(t in xe))throw new Error("unknown hint "+t);return xe[t](e);case 2:return xe.Attr(e);case 3:return xe.Node(e);case 9:return xe.Document(e)}throw new Error("unknown brand "+r)};var Pe=ye?e=>e===window||e===globalThis?Q:e:ie(((e,t="Element")=>{if(e===window||e===globalThis)return Q;switch(typeof e){case"object":return e&&Re(e,t);case"string":return new ve(e);case"number":return new me(e);default:throw new Error("unsupported value")}}));const Ae={get(e,t){const r=e;for(;!m(e,t);)e=w(e);const{get:n,set:s}=g(e,t);return function(){return arguments.length?o(s,r,arguments):i(n,r)}}},Oe=t=>new e(t,Ae);let{Math:Le,setInterval:Me,performance:Ne}=Pe(window);const Ie={mark(){},end(){},toString:()=>"{mark(){},end(){}}"};let Ce=!0;function We(e,t=10){if(Ce)return Ie;function r(){let e=Pe([]);for(let{name:t,duration:r}of Ne.getEntriesByType("measure"))e.push({name:t,duration:r});e.length&&Ne.clearMeasures()}return We[e]||(We[e]=Me(r,Le.round(6e4/Le.min(60,t)))),{mark(){Ne.mark(e)},end(t=!1){Ne.measure(e,e);const n=Ne.getEntriesByName(e,"measure"),o=n.length>0?n[n.length-1]:null;console.log("PROFILER:",o),Ne.clearMarks(e),t&&(clearInterval(We[e]),delete We[e],r())}}}let{Array:Fe,document:De,Math:He,RegExp:Je}=Pe(window);function qe(e){let{length:t}=e;if(t>1&&"/"===e[0]){let r="/"===e[t-1];if(r||t>2&&Pe(e).endsWith("/i")){let t=[Pe(e).slice(1,r?-1:-2)];return r||t.push("i"),new Je(...t)}}return new Je(Pe(e).replace(/[-/\\^$*+?.()|[\]{}]/g,"\\$&"))}function Be(){return Pe(He.floor(2116316160*He.random()+60466176)).toString(36)}function ze(e){return Pe(Fe.from(e)).map((e=>`'${e}'`)).join(" ")}let _e=!1,Ue=null;function Ve(){return _e}const{console:Xe}=Pe(window),Ge=()=>{};function Ke(...e){let{mark:t,end:r}=We("log");if(Ve()){const t=["%c DEBUG","font-weight: bold;"],r=e.indexOf("error"),n=e.indexOf("warn"),o=e.indexOf("success"),s=e.indexOf("info");-1!==r?(t[0]+=" - ERROR",t[1]+="color: red; border:2px solid red",Pe(e).splice(r,1)):-1!==n?(t[0]+=" - WARNING",t[1]+="color: orange; border:2px solid orange ",Pe(e).splice(n,1)):-1!==o?(t[0]+=" - SUCCESS",t[1]+="color: green; border:2px solid green",Pe(e).splice(o,1)):-1!==s&&(t[1]+="color: black;",Pe(e).splice(s,1)),Pe(e).unshift(...t);const i=Ue;if(i){if(!Pe(e).some((e=>Pe(i).test(e))))return}}t(),Xe.log(...e),r()}function Qe(e){return s(Ve()?Ke:Ge,null,e)}let{parseFloat:Ye,variables:Ze,clearTimeout:et,fetch:tt,setTimeout:rt,Array:nt,Error:ot,Map:st,Object:it,ReferenceError:at,Set:ct,WeakMap:lt}=Pe(window),{onerror:ut}=Oe(window),pt=Node.prototype,ft=Element.prototype,dt=null;function ht(e,t,r,n=!0){let o=Pe(t),s=o.indexOf(".");if(-1==s){let o=it.getOwnPropertyDescriptor(e,t);if(o&&!o.configurable)return;let s=it.assign({},r,{configurable:n});if(!o&&!s.get&&s.set){let r=e[t];s.get=()=>r}return void it.defineProperty(e,t,s)}let i=o.slice(0,s).toString();t=o.slice(s+1).toString();let a=e[i];!a||"object"!=typeof a&&"function"!=typeof a||ht(a,t,r);let c=it.getOwnPropertyDescriptor(e,i);if(c&&!c.configurable)return;dt||(dt=new lt),dt.has(e)||dt.set(e,new st);let l=dt.get(e);if(l.has(i))return void l.get(i).set(t,r);let u=new st([[t,r]]);l.set(i,u),it.defineProperty(e,i,{get:()=>a,set(e){if(a=e,a&&("object"==typeof a||"function"==typeof a))for(let[e,t]of u)ht(a,e,t)},configurable:n})}function gt(e){let t=ut();ut(((...r)=>{let n=r.length&&r[0];return!("string"!=typeof n||!Pe(n).includes(e))||("function"==typeof t?o(t,this,r):void 0)}))}function yt(e,t,r,n="",o=!0){let s=Qe(e);if(!r)return void s("error","no property to abort on read");let i=Be();s("info",`aborting on ${r} access`),ht(t,r,{get:function(){throw s("success",`${r} access aborted`,`\nFILTER: ${e} ${n}`),new at(i)},set(){}},o),gt(i)}function wt(e,t,r,n="",o=!0){let s=Qe(e);if(!r)return void s("error","no property to abort on write");let i=Be();s("info",`aborting when setting ${r}`),ht(t,r,{set:function(){throw s("success",`setting ${r} aborted`,`\nFILTER: ${e} ${n}`),new at(i)}},o),gt(i)}function mt(e,t=!1,r=!1){let n=Ze.abortedIframes,s=Ze.iframePropertiesToAbort;const a=ze(e);for(let o of nt.from(window.frames))if(n.has(o))for(let s of e)t&&n.get(o).read.add({property:s,formattedProperties:a}),r&&n.get(o).write.add({property:s,formattedProperties:a});for(let n of e)t&&s.read.add({property:n,formattedProperties:a}),r&&s.write.add({property:n,formattedProperties:a});function c(){for(let e of nt.from(window.frames)){n.has(e)||n.set(e,{read:new ct(s.read),write:new ct(s.write)});let t=n.get(e).read;if(t.size>0){let r=nt.from(t);t.clear();for(let{property:t,formattedProperties:n}of r)yt("abort-on-iframe-property-read",e,t,n)}let r=n.get(e).write;if(r.size>0){let t=nt.from(r);r.clear();for(let{property:r,formattedProperties:n}of t)wt("abort-on-iframe-property-write",e,r,n)}}}c(),n.has(document)||(n.set(document,!0),function(e){let t;function r(e,t){for(let r of t){ht(e,r,n(e,r))}}function n(t,r){let n=t[r];return{get:()=>function(...t){let r;return r=o(n,this,t),e&&e(),r}}}function s(t,r){let n=it.getOwnPropertyDescriptor(t,r),{set:o}=n||{};return{set(t){let r;return r=i(o,this,t),e&&e(),r}}}r(pt,["appendChild","insertBefore","replaceChild"]),r(ft,["append","prepend","replaceWith","after","before","insertAdjacentElement","insertAdjacentHTML"]),t=s(ft,"innerHTML"),ht(ft,"innerHTML",t),t=s(ft,"outerHTML"),ht(ft,"outerHTML",t)}(c))}let{Object:vt}=window;function bt(e,t){if(!(e instanceof vt))return;let r=e,n=Pe(t).split(".");if(0===n.length)return;for(let e=0;e<n.length-1;e++){let t=n[e];if(!m(r,t))return;if(r=r[t],!(r instanceof vt))return}let o=n[n.length-1];return m(r,o)?[r,o]:void 0}const Et=Pe(/^\d+$/);function $t(e){switch(e){case"false":return!1;case"true":return!0;case"falseStr":return"false";case"trueStr":return"true";case"null":return null;case"noopFunc":return()=>{};case"trueFunc":return()=>!0;case"falseFunc":return()=>!1;case"emptyArray":return[];case"emptyObj":return{};case"undefined":return;case"":return e;default:return Et.test(e)?Ye(e):e}}function St(e,t){if(!e||!e.length)return!0;const r=Be(),n=new ot(r),o=new URL(self.location.href);o.hash="";const s=/(.*?@)?(\S+)(:\d+):\d+\)?$/,i=[];for(let e of n.stack.split(/[\n\r]+/)){if(Pe(e).includes(r))continue;e=Pe(e).trim();const t=Pe(s).exec(e);if(null===t)continue;let n=t[2];Pe(n).startsWith("(")&&(n=Pe(n).slice(1)),n===o.href?n="inlineScript":Pe(n).startsWith("<anonymous>")&&(n="injectedScript");let a=t[1]?Pe(t[1]).slice(0,-1):Pe(e).slice(0,Pe(t).index).trim();Pe(a).startsWith("at")&&(a=Pe(a).slice(2).trim());let c=t[3];Pe(i).push(" "+`${a} ${n}${c}:1`.trim())}i[0]="stackDepth:"+(i.length-1);const a=Pe(i).join("\n");for(let r of e){if(qe(r).test(a))return t("info",`Found needle in stack trace: ${r}`),!0}return t("info",`Stack trace does not match any needle. Stack trace: ${a}`),!1}new st;let{HTMLScriptElement:Tt,Object:jt,ReferenceError:kt}=Pe(window),xt=jt.getPrototypeOf(Tt);const{Error:Rt,Object:Pt,Array:At,Map:Ot}=Pe(window);let Lt=null;function Mt(e,t,r){let n=e;for(const e of r){if(!n||!m(n,e))return!1;n=n[e]}if("string"==typeof n||"number"==typeof n){const e=n.toString();return t.test(e)}return!1}const{Array:Nt,Blob:It,Error:Ct,Object:Wt,Reflect:Ft}=Pe(window),Dt=[];let{Error:Ht,URL:Jt}=Pe(window),{cookie:qt}=Oe(document);const{Map:Bt,Object:zt,Reflect:_t,WeakMap:Ut}=Pe(window),Vt=window.EventTarget.prototype.addEventListener,Xt=window.EventTarget.prototype.removeEventListener,Gt=new Ut;let Kt=[];let{console:Qt,document:Yt,getComputedStyle:Zt,isExtensionContext:er,variables:tr,Array:rr,MutationObserver:nr,Object:or,DOMMatrix:sr,XPathEvaluator:ir,XPathExpression:ar,XPathResult:cr}=Pe(window);const{querySelectorAll:lr}=Yt,ur=lr&&s(lr,Yt);function pr(e,t=!1){return hr(e,ur.bind(Yt),Yt,t)}function fr(e,t,r,n){const o=t.getAttribute("xlink:href")||t.getAttribute("href");if(o){const i=ur(o)[0];if(!i&&Ve())return Qt.log("No elements found matching",o),!1;if(!(s=e)||0===s.length||s.every((e=>""===e.trim()))){const e=n.length>0?n:[];return r.push({element:i,rootParents:[...e,t]}),!1}const a=i.querySelectorAll.bind(i);return{nextBoundElement:i,nestedSelectorsString:e.join("^^"),next$$:a}}var s}function dr(e,t){const r=function(e,t=!1){try{const r=navigator.userAgent.includes("Firefox")?e.openOrClosedShadowRoot:browser.dom.openOrClosedShadowRoot(e);return null===r&&Ve()&&!t&&Qt.log("Shadow root not found or not added in element yet",e),r}catch(r){return Ve()&&!t&&Qt.log("Error while accessing shadow root",e,r),null}}(t);if(r){const{querySelectorAll:n}=r,o=n&&s(n,r).bind(r);return{nextBoundElement:t,nestedSelectorsString:":host "+e.join("^^"),next$$:o}}return!1}function hr(e,t,r,n,o=[]){if(e.includes("^^")){const[s,i,...a]=e.split("^^");let c,l;switch(i){case"svg":l=fr;break;case"sh":l=dr;break;default:return Ve()&&Qt.log(i," is not supported. Supported commands are: \n^^sh^^\n^^svg^^"),[]}c=""===s.trim()?[r]:t(s);const u=[];for(const e of c){const t=l(a,e,u,o);if(!t)continue;const{next$$:r,nestedSelectorsString:s,nextBoundElement:i}=t,c=hr(s,r,i,n,[...o,e]);c&&u.push(...c)}return u}const s=t(e);return n?[...s].map((e=>({element:e,rootParents:o.length>0?o:[]}))):s}const{assign:gr,setPrototypeOf:yr}=or;class wr extends ar{evaluate(...e){return yr(o(super.evaluate,this,e),cr.prototype)}}class mr extends ir{createExpression(...e){return yr(o(super.createExpression,this,e),wr.prototype)}}function vr(e){if(tr.hidden.has(e))return!1;!function(e){er&&"function"==typeof checkElement&&checkElement(e)}(e),tr.hidden.add(e);let{style:t}=Pe(e),r=Pe(t,"CSSStyleDeclaration"),n=Pe([]);const o=$();let{debugCSSProperties:s}=o;for(let[e,t]of s||[["display","none"]])r.setProperty(e,t,"important"),n.push([e,r.getPropertyValue(e)]);return new nr((()=>{for(let[e,t]of n){let n=r.getPropertyValue(e),o=r.getPropertyPriority(e);n==t&&"important"==o||r.setProperty(e,t,"important")}})).observe(e,{attributes:!0,attributeFilter:["style"]}),!0}function br(e){let t=e;if(t.startsWith("xpath(")&&t.endsWith(")")){let t=function(e){let t=e;if(t.startsWith("xpath(")&&t.endsWith(")")){let e=t.slice(6,-1),r=(new mr).createExpression(e,null),n=cr.ORDERED_NODE_SNAPSHOT_TYPE;return e=>{if(!e)return;let t=r.evaluate(Yt,n,null),{snapshotLength:o}=t;for(let r=0;r<o;r++)e(t.snapshotItem(r))}}return t=>pr(e).forEach(t)}(e);return()=>{let e=Pe([]);return t((t=>e.push(t))),e}}return()=>rr.from(pr(e))}let{ELEMENT_NODE:Er,TEXT_NODE:$r,prototype:Sr}=Node,{prototype:Tr}=Element,{prototype:jr}=HTMLElement,{console:kr,variables:xr,DOMParser:Rr,Error:Pr,MutationObserver:Ar,Object:Or,ReferenceError:Lr}=Pe(window),{getOwnPropertyDescriptor:Mr}=Or;const{CanvasRenderingContext2D:Nr,document:Ir,Map:Cr,MutationObserver:Wr,Object:Fr,Set:Dr,WeakMap:Hr,WeakSet:Jr}=Pe(window);let qr,Br=new Hr,zr=new Jr,_r=new Dr,Ur=new Jr;function Vr(e,t,r,n){zr.add(e),Br.delete(e);const o=Pe(e).closest(t.selector);o&&!Ur.has(o)?(vr(o),Ur.add(o),Qe("hide-if-canvas-contains")("success","Matched: ",o,`\nFILTER: hide-if-canvas-contains ${t.formattedArguments}`)):function(e,t,r,n){_r.add({canvasElement:e,rule:t,functionName:r,text:n})}(e,t,r,n)}let{Array:Xr,Error:Gr,Map:Kr,parseInt:Qr}=Pe(window);const{Map:Yr,MutationObserver:Zr,Object:en,Set:tn,WeakSet:rn}=Pe(window);let nn=Element.prototype,{attachShadow:on}=nn,sn=new rn,an=new Yr,cn=null;const{Error:ln,Object:un,Array:pn,parseFloat:fn,isNaN:dn}=Pe(window);class hn{constructor(e){if("string"!=typeof e)throw new ln("JSONPath: query must be a string");if(!e.length)throw new ln("JSONPath: query must be a non-empty string");this._steps=this._tokenize(e)}_tokenize(e){e=Pe(e);const t=new pn;let r=0;for("$"===e[0].toString()&&(r=1);r<e.length;){let n=!1;if(e.startsWith("..",r)?(n=!0,r+=2):"."===e[r].toString()&&r++,"["===e[r].toString()){const o=e.indexOf("]",r);if(-1===o)throw new ln(`JSONPath: unclosed bracket in query "${e}"`);const s=e.slice(r+1,o);if(!s.length)throw new ln(`JSONPath: empty bracket notation in query "${e}"`);s.startsWith("?(")?t.push({type:"filter",key:"?",filter:this._parseFilter(s),recursive:n}):t.push({type:"direct",key:s.replace(/['"]/g,"").toString(),recursive:n}),r=o+1}else{const o=e.slice(r).search(/[.[]/),s=-1===o?e.slice(r).toString():e.slice(r,r+o).toString();if(!s&&!n)throw new ln(`JSONPath: trailing dot with no property name in query "${e}"`);(s||n)&&t.push({type:"direct",key:s||"*",recursive:n}),r+=s.length}}return t}_parseFilter(e){const t=(e=Pe(e)).match(/(?:[@.]?)([\w]+(?:\.[\w]+)*)\s*([!=^$*]=|[<>]=?)\s*(?:['"](.+?)['"]|([\w.+-]+))\)/);if(!t)throw new ln(`JSONPath: invalid filter expression "${e}"`);return{property:t[1],operator:t[2],target:null!=t[3]?t[3]:t[4]}}evaluate(e){if(!e||"object"!=typeof e)throw new ln("JSONPath: evaluate() requires an object or array");let t=Pe([{parent:{root:e},key:"root"}]);for(const e of this._steps){const r=[];for(const{parent:n,key:o}of t){const t=n[o];t&&"object"==typeof t&&(e.recursive?this._deepSearch(t,e,r):this._match(t,e,r))}t=r}return t}_match(e,t,r){const n="*"===t.key||"?"===t.key?un.keys(e):[t.key];for(const o of n)if(m(e,o)){if("?"===t.key&&!this._test(e[o],t.filter))continue;r.push({parent:e,key:o})}}_deepSearch(e,t,r,n=1e4){if(this._match(e,t,r),!(n<=0))for(const o of un.keys(e))e[o]&&"object"==typeof e[o]&&this._deepSearch(e[o],t,r,n-1)}_test(e,t){if(!t||!e)return!1;let r=e;for(const e of Pe(t.property).split(".")){if(null==r||"object"!=typeof r)return!1;r=r[e]}const n=Pe(r),o=Pe(t.target),s=n.toString(),i=o.toString(),a=fn(n),c=fn(o),l=!dn(a)&&!dn(c);switch(t.operator){case"==":return l?a===c:s===i;case"!=":return l?a!==c:s!==i;case"<":return l?a<c:s<i;case"<=":return l?a<=c:s<=i;case">":return l?a>c:s>i;case">=":return l?a>=c:s>=i;case"^=":return n.startsWith(o);case"$=":return n.endsWith(o);case"*=":return n.includes(o);default:return!1}}}const{Array:gn,Error:yn,JSON:wn,Map:mn,Object:vn,Response:bn}=Pe(window);let En=null;let{Array:$n,Error:Sn,JSON:Tn,Map:jn,Object:kn,Response:xn}=Pe(window),Rn=null;const{Error:Pn,Object:An,Map:On}=Pe(window);let Ln=null;function Mn(e,t,r){if(!r.length){if("string"==typeof e||"number"==typeof e){const r=e.toString();return t.test(r)}return!1}let n=e;for(const e of r){if(!n||!m(n,e))return!1;n=n[e]}if("string"==typeof n||"number"==typeof n){const e=n.toString();return t.test(e)}return!1}let{Error:Nn}=Pe(window);const{Array:In,addEventListener:Cn,Error:Wn,Object:Fn,Reflect:Dn,Set:Hn,WeakSet:Jn}=Pe(window),qn=new Jn,Bn=new In,zn=new Hn;let{Error:_n,Map:Un,Object:Vn,console:Xn}=Pe(window),{toString:Gn}=Function.prototype,Kn=EventTarget.prototype,{addEventListener:Qn}=Kn,Yn=null;let{fetch:Zn}=Pe(window),eo=!1;const to=[],ro=[],no=()=>{eo||(window.fetch=l(Zn,((...e)=>{let[t]=e;if(to.length>0&&"string"==typeof t){let r;try{r=new URL(t)}catch(e){if(!(e instanceof TypeError))throw e;r=new URL(t,Pe(document).location)}to.forEach((e=>e(r))),e[0]=r.href}return o(Zn,self,e).then((e=>{let t=e;return ro.forEach((e=>{t=e(t)})),t}))})),eo=!0)};let oo,{Map:so,Object:io,RegExp:ao,Response:co}=Pe(window);const{Error:lo,Object:uo,atob:po,btoa:fo,RegExp:ho}=Pe(window);let{XMLHttpRequest:go,WeakMap:yo}=Pe(window),wo=!1;const mo=[],vo=[],bo=new yo,Eo=()=>{wo||(window.XMLHttpRequest=class extends go{open(e,t,...r){return bo.set(this,{method:e,url:t}),super.open(e,t,...r)}send(e){let t=e;if("string"==typeof e&&mo.length>0)for(const e of mo)t=e(t);return super.send(t)}get response(){const e=super.response;if(0===vo.length)return e;const t=bo.get(this);if(void 0===t)return e;const r="string"==typeof e?e.length:void 0;if(t.lastResponseLength!==r&&(t.cachedResponse=void 0,t.lastResponseLength=r),void 0!==t.cachedResponse)return t.cachedResponse;if("string"!=typeof e)return t.cachedResponse=e;let n=e;for(const e of vo)n=e(n);return t.cachedResponse=n}get responseText(){const e=this.response;return"string"!=typeof e?super.responseText:e}},wo=!0)};let $o,{Array:So,Error:To,JSON:jo,Object:ko,RegExp:xo}=Pe(window);let Ro,{JSON:Po,RegExp:Ao}=Pe(window);let Oo,{delete:Lo,has:Mo}=c(URLSearchParams.prototype);const{Error:No,Object:Io,parseInt:Co,isNaN:Wo}=Pe(window),{toString:Fo}=Function.prototype,Do=window.setTimeout,Ho=window.setInterval,Jo={TIMEOUT:"timeout",INTERVAL:"interval",BOTH:"both"};let qo=null;const Bo={"abort-current-inline-script":function(e,t=null){const r=ze(arguments),n=Qe("abort-current-inline-script"),{mark:o,end:s}=We("abort-current-inline-script"),a=t?qe(t):null,c=Be(),l=Pe(document).currentScript;let u=window;const p=Pe(e).split("."),f=Pe(p).pop();for(let e of Pe(p))if(u=u[e],!u||"object"!=typeof u&&"function"!=typeof u)return void n("warn",p," is not found");const{get:d,set:h}=jt.getOwnPropertyDescriptor(u,f)||{};let g=u[f];void 0===g&&n("warn","The property",f,"doesn't exist yet. Check typos.");const y=()=>{const e=Pe(document).currentScript;if(e instanceof xt&&""==Pe(e,"HTMLScriptElement").src&&e!=l&&(!a||a.test(Pe(e).textContent)))throw n("success",p," is aborted \n",e,"\nFILTER: abort-current-inline-script",r),new kt(c)},w={get(){return y(),d?i(d,this):g},set(e){y(),h?i(h,this,e):g=e}};o(),ht(u,f,w),s(),gt(c)},"abort-on-iframe-property-read":function(...e){const{mark:t,end:r}=We("abort-on-iframe-property-read");t(),mt(e,!0,!1),r()},"abort-on-iframe-property-write":function(...e){const{mark:t,end:r}=We("abort-on-iframe-property-write");t(),mt(e,!1,!0),r()},"abort-on-property-read":function(e,t){const r=!("false"===t),n=ze(arguments),{mark:o,end:s}=We("abort-on-property-read");o(),yt("abort-on-property-read",window,e,n,r),s()},"abort-on-property-write":function(e,t){const r=ze(arguments),{mark:n,end:o}=We("abort-on-property-write"),s=!("false"===t);n(),wt("abort-on-property-write",window,e,r,s),o()},"array-override":function(e,t,r="false",n,s){if(!e)throw new Rt("[array-override snippet]: Missing method to override.");if(!t)throw new Rt("[array-override snippet]: Missing needle.");Lt||(Lt=new Ot);let i=Qe("array-override");const{mark:a,end:c}=We("array-override"),u=ze(arguments);if("push"!==e||Lt.has("push"))if("includes"!==e||Lt.has("includes")){if("forEach"===e&&!Lt.has("forEach")){a();const{forEach:e}=At.prototype;Lt.set("forEach",Pe([])),Pt.defineProperty(window.Array.prototype,"forEach",{value:l(e,(function(t,r){const n=Lt.get("forEach");return o(e,this,[function(e,s,a){for(const{needleRegex:t,pathSegments:r,stackNeedles:o}of n)if(r.length||"string"!=typeof e&&"number"!=typeof e){if(r.length&&"object"==typeof e&&null!==e&&Mt(e,t,r)&&St(o,i))return void i("success",`Array.forEach skipped callback for object containing needle: ${t}\nFILTER: array-override ${u}`)}else{const r=e.toString();if(r.match&&r.match(t)&&St(o,i))return void i("success",`Array.forEach skipped callback for item matching needle: ${t}\nFILTER: array-override ${u}`)}return o(t,r||this,[e,s,a])},r])}))}),i("info","Wrapped Array.prototype.forEach"),c()}}else{a();const{includes:e}=At.prototype;Lt.set("includes",Pe([])),Pt.defineProperty(window.Array.prototype,"includes",{value:l(e,(function(t){const r=Lt.get("includes");for(const{needleRegex:e,retVal:n,pathSegments:o,stackNeedles:s}of r)if(o.length||"string"!=typeof t&&"number"!=typeof t){if(o.length&&"object"==typeof t&&null!==t&&Mt(t,e,o)&&St(s,i))return i("success",`Array.includes returned ${n} for object containing ${e}\nFILTER: array-override ${u}`),n}else if(t.toString().match&&t.toString().match(e)&&St(s,i))return i("success",`Array.includes returned ${n} for ${e}\nFILTER: array-override ${u}`),n;return o(e,this,arguments)}))}),i("info","Wrapped Array.prototype.includes"),c()}else{a();const{push:e}=At.prototype;Lt.set("push",Pe([])),Pt.defineProperty(window.Array.prototype,"push",{value:l(e,(function(t){const r=Lt.get("push");for(const{needleRegex:e,pathSegments:n,stackNeedles:o}of r)if(n.length||"string"!=typeof t&&"number"!=typeof t){if(n.length&&"object"==typeof t&&null!==t&&Mt(t,e,n)&&St(o,i))return void i("success",`Array.push is ignored for object containing needle: ${e}\nFILTER: array-override ${u}`)}else{const r=t.toString();if(r.match&&r.match(e)&&St(o,i))return void i("success",`Array.push is ignored for needle: ${e}\nFILTER: array-override ${u}`)}return o(e,this,arguments)}))}),i("info","Wrapped Array.prototype.push"),c()}const p=qe(t);let f=[];n&&(f=n.split("."));let d=[];s&&(d=s.split(",").map((e=>e.trim())));const h=Lt.get(e),g="true"===r;h.push({needleRegex:p,retVal:g,pathSegments:f,stackNeedles:d}),Lt.set(e,h)},"blob-override":function(e,t="",r=null){if(!e)throw new Ct("[blob-override snippet]: Missing parameter search.");const n=Qe("blob-override"),o=ze(arguments),{mark:s,end:i}=We("blob-override");if(s(),Dt.push({match:qe(e),replaceWith:t,needle:r?qe(r):null,formattedArgs:o}),Dt.length>1)return;const a=It;function c(e,t={}){if(Nt.isArray(e)){let t=Pe(e).join("");for(const e of Pe(Dt))e.needle&&!e.needle.test(t)||!e.match.test(t)||(t=t.replace(e.match,e.replaceWith),n("success",`Replaced: ${e.match} → ${e.replaceWith},\nFILTER: blob-override ${e.formattedArgs}`));e=[t]}const r=Ft.construct(a,[e,t]);return Wt.setPrototypeOf(r,c.prototype),r}c.prototype=a.prototype,Wt.setPrototypeOf(c,a),window.Blob=c,n("info","Wrapped Blob constructor in context "),i()},"cookie-remover":function(e,t=!1){if(!e)throw new Ht("[cookie-remover snippet]: No cookie to remove.");const r=ze(arguments);let n=Qe("cookie-remover");const{mark:o,end:s}=We("cookie-remover");let i=qe(e);if(!Pe(/^http|^about/).test(location.protocol))return void n("warn","Snippet only works for http or https and about.");function a(){return Pe(qt()).split(";").filter((e=>i.test(Pe(e).split("=")[0])))}const c=()=>{n("info","Parsing cookies for matches"),o();for(const e of Pe(a())){let t=Pe(location.hostname);!t&&Pe(location.ancestorOrigins)&&Pe(location.ancestorOrigins[0])&&(t=new Jt(Pe(location.ancestorOrigins[0])).hostname);const o=Pe(e).split("=")[0],s="expires=Thu, 01 Jan 1970 00:00:00 GMT",i="path=/",a=t.split(".");for(let e=a.length;e>0;e--){const t=a.slice(a.length-e).join(".");qt(`${Pe(o).trim()}=;${s};${i};domain=${t}`),qt(`${Pe(o).trim()}=;${s};${i};domain=.${t}`),n("success",`Set expiration date on ${o}`,"\nFILTER: cookie-remover",r)}}s()};if(c(),t){let e=a();setInterval((()=>{let t=a();if(t!==e)try{c()}finally{e=t}}),1e3)}},profile:function(){Ce=!1},debug:function(e){_e=!0,e&&(Ue=qe(e))},"event-override":function(e,t,r=null){const n=ze(arguments),s={eventType:e,mode:t,needle:r?qe(r):null,formattedArgs:n};if(Kt.includes(s)||Kt.push(s),Kt.length>1)return;let a=Qe("[event-override]");const{mark:c,end:u}=We("event-override"),p=zt.getOwnPropertyDescriptor(window.EventTarget.prototype,"addEventListener");p.configurable&&zt.defineProperty(window.EventTarget.prototype,"addEventListener",{...p,value:l(Vt,(function(e,t,r){c();const n=Kt.filter((t=>t.eventType===e));if(!n.length||e!==n[0].eventType)return u(),o(Vt,this,arguments);const s=n.find((e=>"disable"===e.mode&&(!e.needle||e.needle.test(t.toString()))));if(s)return a("success",`Disabling ${s.eventType} event, \nFILTER: event-override ${s.formattedArgs}`),void u();const l=n.filter((e=>"trusted"===e.mode&&(!e.needle||e.needle.test(t.toString()))));if("function"!=typeof t&&(!t||"function"!=typeof t.handleEvent)||!l.length||e!==l[0].eventType)return u(),o(Vt,this,arguments);const p=function(e){const r=new Proxy(e,{get(t,r){if("isTrusted"===r)return a("success",`Providing trusted value for ${e.type} event`),!0;const n=_t.get(t,r);return"function"==typeof n?function(...e){return o(n,t,e)}:n}});return"function"==typeof t?i(t,this,r):i(t.handleEvent,t,r)};return p.originalListener=t,Gt.has(t)||Gt.set(t,new Bt),Gt.get(t).set(e,p),a("info",`\nWrapping event listener for ${e}`),u(),o(Vt,this,[e,p,r])}))});const f=zt.getOwnPropertyDescriptor(window.EventTarget.prototype,"removeEventListener");f.configurable&&zt.defineProperty(window.EventTarget.prototype,"removeEventListener",{...f,value:l(Xt,(function(e,t,r){if(t&&Gt.has(t)&&Gt.get(t).has(e)){const n=Gt.get(t).get(e);return Gt.get(t).delete(e),o(Xt,this,[e,n,r])}return o(Xt,this,arguments)}))}),a("info","Initialized event-override snippet")},"freeze-element":function(e,t="",...r){let n,s,a=!1,c=!1,l=Pe(r).filter((e=>!h(e))),u=Pe(r).filter((e=>h(e))).map(qe),p=Be(),f=br(e);!function(){let r=Pe(t).split("+");1===r.length&&""===r[0]&&(r=[]);for(let t of r)switch(t){case"subtree":a=!0;break;case"abort":c=!0;break;default:throw new Pr("[freeze] Unknown option passed to the snippet. [selector]: "+e+" [option]: "+t)}}();let d={selector:e,shouldAbort:c,rid:p,exceptionSelectors:l,regexExceptions:u,changeId:0};function h(e){return e.length>=2&&"/"==e[0]&&"/"==e[e.length-1]}function g(){s=f(),y(s,!1)}function y(e,t=!0){for(let r of e)xr.frozen.has(r)||(xr.frozen.set(r,d),!t&&a&&new Ar((e=>{for(let t of Pe(e))y(Pe(t,"MutationRecord").addedNodes)})).observe(r,{childList:!0,subtree:!0}),a&&Pe(r).nodeType===Er&&y(Pe(r).childNodes))}function w(e,...t){Ke(`[freeze][${e}] `,...t)}function m(e,t,r,n){let o=n.selector,s=n.changeId,i="string"==typeof e,a=n.shouldAbort?"aborting":"watching";switch(kr.groupCollapsed(`[freeze][${s}] ${a}: ${o}`),r){case"appendChild":case"append":case"prepend":case"insertBefore":case"replaceChild":case"insertAdjacentElement":case"insertAdjacentHTML":case"insertAdjacentText":case"innerHTML":case"outerHTML":w(s,i?"text: ":"node: ",e),w(s,"added to node: ",t);break;case"replaceWith":case"after":case"before":w(s,i?"text: ":"node: ",e),w(s,"added to node: ",Pe(t).parentNode);break;case"textContent":case"innerText":case"nodeValue":w(s,"content of node: ",t),w(s,"changed to: ",e)}w(s,`using the function "${r}"`),kr.groupEnd(),n.changeId++}function v(e,t){if(t)for(let r of t)if(r.test(e))return!0;return!1}function b(e){throw new Lr(e)}function E(e,t,r,n){let o=new Rr,{body:s}=Pe(o.parseFromString(e,"text/html")),i=$(Pe(s).childNodes,t,r,n);return Pe(i).map((e=>{switch(Pe(e).nodeType){case Er:return Pe(e).outerHTML;case $r:return Pe(e).textContent;default:return""}})).join("")}function $(e,t,r,n){let o=Pe([]);for(let s of e)S(s,t,r,n)&&o.push(s);return o}function S(e,t,r,n){let o=n.shouldAbort,s=n.regexExceptions,i=n.exceptionSelectors,a=n.rid;if("string"==typeof e){let i=e;return!!v(i,s)||(Ve()&&m(i,t,r,n),o&&b(a),Ve())}let c=e;switch(Pe(c).nodeType){case Er:return!!function(e,t){if(t){let r=Pe(e);for(let e of t)if(r.matches(e))return!0}return!1}(c,i)||(o&&(Ve()&&m(c,t,r,n),b(a)),!!Ve()&&(vr(c),m(c,t,r,n),!0));case $r:return!!v(Pe(c).textContent,s)||(Ve()&&m(c,t,r,n),o&&b(a),!1);default:return!0}}function T(e,t,r,n){let s=Mr(e,t)||{},a=s.get&&i(s.get,e)||s.value;if(a)return{get:()=>function(...e){if(r(this)){let r=n(this);if(r){let n=e[0];if(!S(n,this,t,r))return n}}return o(a,this,e)}}}function j(e,t,r,n){let s=Mr(e,t)||{},a=s.get&&i(s.get,e)||s.value;if(a)return{get:()=>function(...e){if(!r(this))return o(a,this,e);let s=n(this);if(!s)return o(a,this,e);let i=$(e,this,t,s);return i.length>0?o(a,this,i):void 0}}}function k(e,t,r,n){let s=Mr(e,t)||{},a=s.get&&i(s.get,e)||s.value;if(a)return{get:()=>function(...e){let[s,c]=e,l="afterbegin"===s||"beforeend"===s;if(r(this,l)){let e=n(this,l);if(e){let r,n=l?this:Pe(this).parentNode;switch(t){case"insertAdjacentElement":if(!S(c,n,t,e))return c;break;case"insertAdjacentHTML":return r=E(c,n,t,e),r?i(a,this,s,r):void 0;case"insertAdjacentText":if(!S(c,n,t,e))return}}}return o(a,this,e)}}}function x(e,t,r,n){let o=Mr(e,t)||{},{set:s}=o;if(s)return{set(e){if(!r(this))return i(s,this,e);let o=n(this);if(!o)return i(s,this,e);let a=E(e,this,t,o);return a?i(s,this,a):void 0}}}function R(e,t,r,n){let o=Mr(e,t)||{},{set:s}=o;if(s)return{set(e){if(!r(this))return i(s,this,e);let o=n(this);return o?S(e,this,t,o)?i(s,this,e):void 0:i(s,this,e)}}}xr.frozen.has(document)||(xr.frozen.set(document,!0),function(){let e;function t(e){return e&&xr.frozen.has(e)}function r(e){try{return e&&(xr.frozen.has(e)||xr.frozen.has(Pe(e).parentNode))}catch(e){return!1}}function n(e,t){try{return e&&(xr.frozen.has(e)&&t||xr.frozen.has(Pe(e).parentNode)&&!t)}catch(e){return!1}}function o(e){return xr.frozen.get(e)}function s(e){try{if(xr.frozen.has(e))return xr.frozen.get(e);let t=Pe(e).parentNode;return xr.frozen.get(t)}catch(e){}}function i(e,t){try{if(xr.frozen.has(e)&&t)return xr.frozen.get(e);let r=Pe(e).parentNode;return xr.frozen.get(r)}catch(e){}}e=T(Sr,"appendChild",t,o),ht(Sr,"appendChild",e),e=T(Sr,"insertBefore",t,o),ht(Sr,"insertBefore",e),e=T(Sr,"replaceChild",t,o),ht(Sr,"replaceChild",e),e=j(Tr,"append",t,o),ht(Tr,"append",e),e=j(Tr,"prepend",t,o),ht(Tr,"prepend",e),e=j(Tr,"replaceWith",r,s),ht(Tr,"replaceWith",e),e=j(Tr,"after",r,s),ht(Tr,"after",e),e=j(Tr,"before",r,s),ht(Tr,"before",e),e=k(Tr,"insertAdjacentElement",n,i),ht(Tr,"insertAdjacentElement",e),e=k(Tr,"insertAdjacentHTML",n,i),ht(Tr,"insertAdjacentHTML",e),e=k(Tr,"insertAdjacentText",n,i),ht(Tr,"insertAdjacentText",e),e=x(Tr,"innerHTML",t,o),ht(Tr,"innerHTML",e),e=x(Tr,"outerHTML",r,s),ht(Tr,"outerHTML",e),e=R(Sr,"textContent",t,o),ht(Sr,"textContent",e),e=R(jr,"innerText",t,o),ht(jr,"innerText",e),e=R(Sr,"nodeValue",t,o),ht(Sr,"nodeValue",e)}()),n=new Ar(g),n.observe(document,{childList:!0,subtree:!0}),g()},"hide-if-canvas-contains":function(e,t="canvas",r=""){const n=Qe("hide-if-canvas-contains"),s=ze(arguments),{mark:i,end:a}=We("hide-if-canvas-contains");if(!e)return void n("error","The parameter 'search' is required");if(!qr){i();const u=Nr.prototype;function p(e){const t=u[e];Fr.defineProperty(window.CanvasRenderingContext2D.prototype,e,{value:l(t,(function(r,...n){const s=this.canvas;if(zr.has(s))return o(t,this,[r,...n]);const i=((Br.get(s)||"")+r).slice(-1e4);Br.set(s,i);for(const[t,r]of qr)t.test(i)&&Vr(s,r,e,i);return o(t,this,[r,...n])}))})}function f(){const e=u.clearRect;Fr.defineProperty(window.CanvasRenderingContext2D.prototype,"clearRect",{value:l(e,(function(...t){let r=!1,n=!0;for(const{clearRectBehavior:e}of qr.values())"always"===e&&(r=!0),"never"!==e&&(n=!1);if(!n){const[e,n,o,s]=t,i=e<=0&&n<=0&&o>=this.canvas.width&&s>=this.canvas.height;(r||i)&&Br.delete(this.canvas)}return o(e,this,t)}))})}function d(){const e=u.drawImage;Fr.defineProperty(window.CanvasRenderingContext2D.prototype,"drawImage",{value:l(e,(function(t,...r){if(n("info","drawImage called with arguments:",t,...r),t&&"string"==typeof t.src&&t.src)for(const[e,r]of qr)e.test(t.src)&&Vr(this.canvas,r,"drawImage",t.src);return o(e,this,[t,...r])}))})}n("info","CanvasRenderingContext2D proxied"),p("fillText"),p("strokeText"),f(),d(),qr=new Cr;new Wr((e=>{for(let t of Pe(e))"childList"===t.type&&_r.forEach((e=>{const t=Pe(e.canvasElement).closest(e.rule.selector);t&&!Ur.has(t)&&(vr(t),Ur.add(t),_r.delete(e),Qe("hide-if-canvas-contains")("success","Matched: ",t,`\nFILTER: hide-if-canvas-contains ${e.rule.formattedArguments}`))}))})).observe(Ir,{childList:!0,subtree:!0}),a()}const c=qe(e);qr.set(c,{selector:t,formattedArguments:s,clearRectBehavior:r})},"hide-if-shadow-contains":function(e,t="*"){const r=ze(arguments);let n=`${e}\\${t}`;an.has(n)||an.set(n,[qe(e),t,Ge],r);const s=Qe("hide-if-shadow-contains"),{mark:i,end:a}=We("hide-if-shadow-contains");cn||(cn=new Zr((e=>{i();let t=new tn;for(let{target:n}of Pe(e)){let e=Pe(n).parentNode;for(;e;)[n,e]=[e,Pe(n).parentNode];if(!sn.has(n)&&!t.has(n)){t.add(n);for(let[e,t,o]of an.values())if(e.test(Pe(n).textContent)){let e=Pe(n.host).closest(t);e&&(o(),Pe(n).appendChild(document.createElement("style")).textContent=":host {display: none !important}",vr(e),sn.add(n),s("success","Hiding: ",e,`\nFILTER: hide-if-shadow-contains ${r}`)),a()}}}})),en.defineProperty(nn,"attachShadow",{value:l(on,(function(){let e=o(on,this,arguments);return s("info","attachShadow is called for: ",e),cn.observe(e,{childList:!0,characterData:!0,subtree:!0}),e}))}))},"json-override":function(e,t,r="",n=""){if(!e)throw new yn("[json-override snippet]: Missing paths to override.");if(void 0===t)throw new yn("[json-override snippet]: No value to override with.");let s=Qe("json-override");const{mark:i,end:a}=We("json-override");if(!En){function f(e,t){for(let{formattedArgs:r,prune:n,jsonPathObjects:o,needle:i,filter:a,value:c}of En.values())if(!a||a.test(t)){if(Pe(i).some((t=>!bt(e,t))))return e;for(let t of n)if(t.startsWith("jsonpath("))try{const n=o.get(t);n.evaluate(e).forEach((({parent:e,key:t})=>{s("success",`JSONPath match found at [${t}], replaced with ${c}`,`\nFILTER: json-override ${r}`),e[t]=$t(c)}))}catch(e){s("error",`JSONPath evaluation failed for: ${t}. Error: ${e.message}`)}else t.includes("{}")||t.includes("[]")?d(e,t,c,r):h(e,t,c,r)}return e}function d(e,t,r,n){let o=Pe(t).split("."),i=e;for(let e=0;e<o.length;e++){let a=o[e];if("[]"===a)return void(gn.isArray(i)&&(s("info",`Iterating over array at: ${a}`),Pe(i).forEach((t=>{null!=t&&d(t,o.slice(e+1).join("."),r,n)}))));if("{}"===a)return void(i&&"object"==typeof i&&(s("info",`Iterating over object at: ${a}`),vn.keys(i).forEach((t=>{let s=i[t];null!=s&&d(s,o.slice(e+1).join("."),r,n)}))));if(!i||"object"!=typeof i||!m(i,a))return;e===o.length-1?(s("success",`Found ${t}, replaced it with ${r}`,`\nFILTER: json-override ${n}`),i[a]=$t(r)):i=i[a]}}function h(e,t,r,n){let o=bt(e,t);void 0!==o&&(s("success",`Found ${t}, replaced it with ${r}`,`\nFILTER: json-override ${n}`),o[0][o[1]]=$t(r))}i();let{parse:g}=wn;En=new mn,vn.defineProperty(window.JSON,"parse",{value:l(g,(function(e){return f(o(g,this,arguments),e)}))}),s("info","Wrapped JSON.parse for override");let{json:y}=bn.prototype;vn.defineProperty(window.Response.prototype,"json",{value:l(y,(function(e){return o(y,this,arguments).then((t=>f(t,e)))}))}),s("info","Wrapped Response.json for override"),a()}const c=ze(arguments),u=Pe(e).split(/ +/),p=new mn;for(const w of u)if(w.startsWith("jsonpath("))try{p.set(w,new hn(w.slice(9,-1)))}catch(v){s("error",`Invalid JSONPath query: ${w}. Error: ${v.message}`)}En.set(e,{formattedArgs:c,prune:u,jsonPathObjects:p,needle:r.length?Pe(r).split(/ +/):[],filter:n?qe(n):null,value:t})},"json-prune":function(e,t="",r=""){if(!e)throw new Sn("Missing paths to prune");let n=Qe("json-prune");const{mark:s,end:i}=We("json-prune");if(!Rn){function p(e){for(let{prune:t,needle:r,jsonPathObjects:o,stackNeedle:s,formattedArgs:i}of Rn.values()){if(Pe(r).length>0&&Pe(r).some((t=>!bt(e,t))))return e;if(Pe(s)&&Pe(s).length>0&&!St(s,n))return e;for(let r of t)if(r.startsWith("jsonpath("))try{const t=o.get(r);t.evaluate(e).forEach((({parent:e,key:t})=>{n("success",`JSONPath match found and deleted at [${t}]`,`\nFILTER: json-prune ${i}`),delete e[t]}))}catch(e){n("error",`JSONPath evaluation failed for: ${r}. Error: ${e.message}`)}else r.includes("{}")||r.includes("[]")||r.includes("{-}")||r.includes("[-]")?f(e,r,i):h(e,r,i)}return e}function f(e,t,r){let o=Pe(t).split("."),s=e;for(let e=0;e<o.length;e++){let i=o[e];if("[]"===i)return void($n.isArray(s)&&(n("info",`Iterating over array at: ${i}`),Pe(s).forEach((t=>f(t,o.slice(e+1).join("."),r)))));if("[-]"===i){if($n.isArray(s)){n("info",`Iterating over array with element removal at: ${i}`);let t=o.slice(e+1).join("."),a=[];Pe(s).forEach(((e,r)=>{d(e,t)&&a.push(r)}));for(let e=a.length-1;e>=0;e--)n("success",`Found element at index ${a[e]} matching ${t} and removed entire element, \nFILTER: json-prune ${r}`),s.splice(a[e],1)}return}if("{}"===i)return void("object"==typeof s&&null!==s&&(n("info",`Iterating over object at: ${i}`),kn.keys(s).forEach((t=>f(s[t],o.slice(e+1).join("."),r)))));if("{-}"===i){if("object"==typeof s&&null!==s){n("info",`Iterating over object with element removal at: ${i}`);let t=o.slice(e+1).join("."),a=[];kn.keys(s).forEach((e=>{d(s[e],t)&&a.push(e)})),a.forEach((e=>{n("success",`Found object key ${e} matching ${t} and removed entire element, \nFILTER: json-prune ${r}`),delete s[e]}))}return}if(!s||"object"!=typeof s||!m(s,i))return;e===o.length-1?(n("success",`Found ${t} and deleted, \nFILTER: json-prune ${r}`),delete s[i]):s=s[i]}}function d(e,t){if(!t||""===t)return!0;let r=Pe(t).split("."),n=e;for(let e=0;e<r.length;e++){let t=r[e];if("[]"===t)return!!$n.isArray(n)&&Pe(n).some((t=>d(t,r.slice(e+1).join("."))));if("{}"===t)return"object"==typeof n&&null!==n&&kn.keys(n).some((t=>d(n[t],r.slice(e+1).join("."))));if(!n||"object"!=typeof n||!m(n,t))return!1;if(e===r.length-1)return!0;n=n[t]}return!1}function h(e,t,r){let o=bt(e,t);void 0!==o&&(n("success",`Found ${t} and deleted`,`\nFILTER: json-prune ${r}`),delete o[0][o[1]])}s();let{parse:g}=Tn;Rn=new jn,kn.defineProperty(window.JSON,"parse",{value:l(g,(function(){return p(o(g,this,arguments))}))}),n("info","Wrapped JSON.parse for prune");let{json:y}=xn.prototype;kn.defineProperty(window.Response.prototype,"json",{value:l(y,(function(){return o(y,this,arguments).then((e=>p(e)))}))}),n("info","Wrapped Response.json for prune"),i()}const a=ze(arguments),c=Pe(e).split(/ +/),u=new jn;for(const w of c)if(w.startsWith("jsonpath("))try{u.set(w,new hn(w.slice(9,-1)))}catch(v){n("error",`Invalid JSONPath query: ${w}. Error: ${v.message}`)}Rn.set(e,{formattedArgs:a,prune:c,jsonPathObjects:u,needle:t.length?Pe(t).split(/ +/):[],stackNeedle:r.length?Pe(r).split(/ +/):[]})},"map-override":function(e,t,r="",n,s){if(!e)throw new Pn("[map-override snippet]: Missing method to override.");if(!t)throw new Pn("[map-override snippet]: Missing needle.");Ln||(Ln=new On);let a=Qe("map-override");const{mark:c,end:u}=We("map-override"),{set:p,get:f,has:d}=On.prototype,h=ze(arguments);"set"!==e||Ln.has("set")?"get"!==e||Ln.has("get")?"has"!==e||Ln.has("has")||(c(),i(p,Ln,"has",Pe([])),An.defineProperty(window.Map.prototype,"has",{value:l(d,(function(e){const t=i(f,Ln,"has");for(const{needleRegex:r,retVal:n,stackNeedles:o}of t)if("string"==typeof e||"number"==typeof e){const t=e.toString();if(r.test(t)&&St(o,a))return a("success",`Map.has returned ${n} for key: ${t}\nFILTER: map-override ${h}`),n}return o(d,this,arguments)}))}),a("info","Wrapped Map.prototype.has"),u()):(c(),i(p,Ln,"get",Pe([])),An.defineProperty(window.Map.prototype,"get",{value:l(f,(function(e){const t=i(f,Ln,"get");for(const{needleRegex:r,retVal:n,stackNeedles:o}of t)if("string"==typeof e||"number"==typeof e){const t=e.toString();if(r.test(t)&&St(o,a))return a("success",`Map.get returned ${n} for key: ${t}\nFILTER: map-override ${h}`),n}return o(f,this,arguments)}))}),a("info","Wrapped Map.prototype.get"),u()):(c(),i(p,Ln,"set",Pe([])),An.defineProperty(window.Map.prototype,"set",{value:l(p,(function(e,t){const r=i(f,Ln,"set");for(const{needleRegex:e,pathSegments:n,stackNeedles:o}of r)if(Mn(t,e,n)&&St(o,a))return a("success",`Map.set is ignored for value matching needle: ${e}\nFILTER: map-override ${h}`),this;return o(p,this,arguments)}))}),a("info","Wrapped Map.prototype.set"),u());const g=qe(t);let y=[];n&&(y=n.split("."));let w=[];s&&(w=s.split(",").map((e=>e.trim())));const m=i(f,Ln,e);let v;"get"===e?v=""===r?void 0:r:"has"===e&&(v="true"===r),m.push({needleRegex:g,retVal:v,pathSegments:y,stackNeedles:w}),i(p,Ln,e,m)},"override-property-read":function(e,t,r){if(!e)throw new Nn("[override-property-read snippet]: No property to override.");if(void 0===t)throw new Nn("[override-property-read snippet]: No value to override with.");const n=ze(arguments);let o=Qe("override-property-read");const{mark:s,end:i}=We("override-property-read");let a=$t(t);o("info",`Overriding ${e}.`);const c=!("false"===r);s(),ht(window,e,{get:()=>(o("success",`${e} override done.`,"\nFILTER: override-property-read",n),a),set(){}},c),i()},"prevent-element-src-loading":function(e,t){if(!e||"string"!=typeof e)throw new Wn("[prevent-element-src-loading snippet]: tagName param must be a string.");if(!t)throw new Wn("[prevent-element-src-loading snippet]: Missing search parameter.");if(e=Pe(e).toString().toLowerCase(),!Pe(["script","img","iframe","link"]).includes(e))throw new Wn("[prevent-element-src-loading snippet]: tagName parameter is incorrect.");const r={script:"data:text/javascript;base64,KCk9Pnt9",img:"data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==",iframe:"data:text/html;base64,PGRpdj48L2Rpdj4=",link:"data:text/plain;base64,"},n={script:window.HTMLScriptElement,img:window.HTMLImageElement,iframe:window.HTMLIFrameElement,link:window.HTMLLinkElement}[e],o="link"===e?"href":"src",s="onerror",i=Qe("[prevent-element-src-loading snippet]"),a=ze(arguments),{mark:c,end:l}=We("prevent-element-src-loading");c();const u=qe(t);if(Bn.push({tagName:e,searchRegex:u}),i("info",`Added filter rule\nFILTER: prevent-element-src-loading ${a}`),!zn.has(e)){zn.add(e);const t={apply:(e,t,n)=>{if(!n[0]||!n[1])return Dn.apply(e,t,n);const s=t.nodeName.toLowerCase(),a=n[0].toLowerCase(),c=n[1];return a===o&&Bn.some((e=>s===e.tagName&&e.searchRegex.test(c)))?(qn.add(t),i("success",`Replaced setAttribute for ${a}: ${c} → ${r[s]}`),Dn.apply(e,t,[a,r[s]])):Dn.apply(e,t,n)}};n.prototype.setAttribute=new Proxy(n.prototype.setAttribute,t),i("info","Wrapped setAttribute function");const s=Fn.getOwnPropertyDescriptor(n.prototype,o);if(!s)return;Fn.defineProperty(n.prototype,o,{enumerable:!0,configurable:!0,get(){return s.get.call(this)},set(e){const t=this.nodeName.toLowerCase();Bn.some((r=>t===r.tagName&&r.searchRegex.test(e)))?(qn.add(this),i("success",`Replaced in src/href setter ${e} → ${r[t]}`),s.set.call(this,r[t])):s.set.call(this,e)}}),i("info","Wrapped src/href property setter")}if(1===Bn.length){const e=Fn.getOwnPropertyDescriptor(HTMLElement.prototype,s);if(!e)return;Fn.defineProperty(HTMLElement.prototype,s,{enumerable:!0,configurable:!0,get(){return e.get.call(this)},set(t){qn.has(this)?(i("success",`Replaced in onerror setter ${t} → () => {}`),e.set.call(this,(()=>{}))):e.set.call(this,t)}}),i("info","Wrapped onerror property setter");const t={apply:(e,t,r)=>{if(!r[0]||!r[1]||!t)return Dn.apply(e,t,r);const n=r[0];return"function"==typeof t.getAttribute&&qn.has(t)&&"error"===n?(i("success",`Replaced error event handler on ${t} with () => {}`),Dn.apply(e,t,[n,()=>{}])):Dn.apply(e,t,r)}};EventTarget.prototype.addEventListener=new Proxy(EventTarget.prototype.addEventListener,t),i("info","Wrapped addEventListener");(()=>{Cn("error",(e=>{const t=e.target;if(!t||!t.nodeName)return;const r=t.src||t.href,n=t.nodeName.toLowerCase();Bn.some((e=>n===e.tagName&&r&&e.searchRegex.test(r)))&&(t.onerror=()=>{})}),!0),i("info","Added event listener to defuse global errors")})()}l()},"prevent-listener":function(e,t,r){if(!e)throw new _n("[prevent-listener snippet]: No event type.");if(!Yn){Yn=new Un;let e=Qe("[prevent]");const{mark:t,end:r}=We("prevent-listener");Vn.defineProperty(Kn,"addEventListener",{value:l(Qn,(function(n,s){t();for(let{evt:t,handlers:r,selectors:o}of Yn.values()){if(!t.test(n))continue;let a=this instanceof Element;for(let l=0;l<r.length;l++){const u=r[l],p=o[l];if(!p||a&&Pe(this).matches(p)){if(u){const t=function(){try{const e=String("function"==typeof s?s:s.handleEvent);return u.test(e)}catch(t){return e("error","Error while trying to stringify listener: ",t),!1}};if(!function(){try{const e=i(Gn,"function"==typeof s?s:s.handleEvent);return u.test(e)}catch(t){return e("error","Error while trying to stringify listener: ",t),!1}}()&&!t())continue}return void(Ve()&&(Xn.groupCollapsed("DEBUG [prevent] was successful",`\nFILTER: prevent-listener ${c}`),e("success",`type: ${n} matching ${t}`),e("success","handler:",s),u&&e("success",`matching ${u}`),p&&e("success","on element: ",this,` matching ${p}`),e("success","was prevented from being added"),Xn.groupEnd()))}}}return r(),o(Qn,this,arguments)}))}),e("info","Wrapped addEventListener")}const n=ze(arguments);Yn.has(e)||Yn.set(e,{evt:qe(e),handlers:[],selectors:[],formattedArgs:n});let{handlers:s,selectors:a,formattedArgs:c}=Yn.get(e);s.push(t?qe(t):null),a.push(r)},"replace-fetch-response":function(e,t="",r=null){const n=ze(arguments),o=Qe("replace-fetch-response"),{mark:s,end:i}=We("replace-fetch-response");if(!e)return void o("error","The parameter 'search' is required");if(!oo){const e=e=>{s();return Pe(e).clone().text().then((t=>{let r=Pe(t);for(const[e,{replacement:n,needle:s,formattedArgs:i}]of oo){if(s){if(!qe(s).test(r)){Ve()&&(console.groupCollapsed(`DEBUG [replace-fetch-response] warn: '${s}' not found in fetch response`),o("warn",`${r}`),console.groupEnd());continue}Ve()&&(console.groupCollapsed(`DEBUG [replace-fetch-response] success: '${s}' found in fetch response`),o("info",`${r}`),console.groupEnd())}r=r.replace(e,n),Ve()&&r.toString()!==t.toString()&&(console.groupCollapsed(`DEBUG [replace-fetch-response] success: '${e}' replaced with '${n}' in fetch response`,`\nFILTER: replace-fetch-response ${i}`),o("success",`${r}`),console.groupEnd())}if(r.toString()===t.toString())return e;const n=new co(r.toString(),{status:e.status,statusText:e.statusText,headers:e.headers});return io.defineProperties(n,{ok:{value:e.ok},redirected:{value:e.redirected},type:{value:e.type},url:{value:e.url}}),i(),n}))};oo=new so,o("info","Network API proxied"),a=e,ro.push(a),no()}var a;const c=qe(e),l=new ao(c,"g");oo.set(l,{replacement:t,needle:r,formattedArgs:n})},"replace-outbound-value":function(e,t="",r="",n="",s="",i=""){if(!e)throw new lo("[replace-outbound-value snippet]: Missing method path.");let a=Qe("replace-outbound-value");const{mark:c,end:u}=We("replace-outbound-value");function p(e,t,r,n){if("base64"===n)try{if(function(e){try{if(""===e)return!1;const t=po(e),r=fo(t),n=Pe(e).replace(/=+$/,"").toString();return Pe(r).replace(/=+$/,"").toString()===n}catch(e){return!1}}(e)){const n=po(e);a("info",`Decoded base64 content: ${n}`);const o=t?Pe(n).replace(t,r).toString():n;a("info",o!==n?`Modified decoded content: ${o}`:"Decoded content was not modified");const s=fo(o);return a("info",`Re-encoded to base64: ${s}`),s}a("info",`Content is plain text: ${e}`);const n=t?Pe(e).replace(t,r).toString():e;a("info",n!==e?`Modified plain text content: ${n}`:"Plain text content was not modified");const o=fo(n);return a("info",`Encoded to base64: ${o}`),o}catch(t){return a("info",`Error processing base64 content: ${t.message}`),e}return t?Pe(e).replace(t,r).toString():e}function f(e,t,r,n,o,s){const i=r?new ho(qe(r),"g"):null;if(t.length&&"object"==typeof e&&null!==e){const c=r?function(e,t,r,n,o){if(!t.length)return e;let s=e;for(let r=0;r<t.length-1;r++){if(!s||"object"!=typeof s)return a("info",`Cannot navigate to path: property '${t[r]}' not found`),e;s=s[t[r]]}const i=t[t.length-1];if(!s||"object"!=typeof s||!(i in s))return a("info",`Target property '${i}' not found at path`),e;const c=s[i];if("string"!=typeof c)return a("info","Property at path is not a string: "+typeof c),e;const l=p(c,r,n,o);if(l!==c){const r=JSON.parse(JSON.stringify(e));let n=r;for(let e=0;e<t.length-1;e++)n=n[t[e]];return n[i]=l,a("info",`Replaced value at path '${t.join(".")}': '${c}' -> '${l}'`),r}return e}(e,t,i,n,o):e;return c!==e&&a("success",`Replaced outbound value\nFILTER: replace-outbound-value ${s}`),c}if("string"==typeof e){r||a("info",`Original text content: ${e}`);const t=r?p(e,i,n,o):e;return t!==e&&a("success",`Replaced outbound value: ${t} \nFILTER: replace-outbound-value ${s}`),t}return e}ze(arguments),c();const d=function(e,t){let r=e,n=Pe(t).split(".");for(let e=0;e<n.length-1;e++){let t=n[e];if(!r||"object"!=typeof r&&"function"!=typeof r)return{base:r,prop:t,remainingPath:n.slice(e).join("."),success:!1};r=r[t]}return{base:r,prop:n[n.length-1],success:!0}}(window,e);if(!d.success)return a("error",`Could not reach the end of the prop chain: ${e}. Remaining path: ${d.remainingPath}`),void u();const{base:h,prop:g}=d,y=h[g];if(!y||"function"!=typeof y)return a("error",`Could not retrieve the method: ${e}`),void u();let w=[];s&&(w=Pe(s).split("."));let m=[];i&&(m=Pe(i).split(",").map((e=>e.trim())));let v=!1;uo.defineProperty(h,g,{value:l(y,(function(){if(v)return o(y,this,arguments);v=!0;const e=o(y,this,arguments);if(m.length&&!St(m,a))return v=!1,e;if(e&&"function"==typeof e.then)return a("info","Method returned a Promise, modifying resolved value"),v=!1,e.then((e=>{const o="object"==typeof e?JSON.stringify(e):e;return a("info",`Promise resolved with value: ${o}`),f(e,w,t,r,n,s)})).catch((e=>{throw a("info",`Promise rejected: ${e.message}`),e}));const i=f(e,w,t,r,n,s);return v=!1,i}))}),a("info",`Wrapped ${e}`),u()},"replace-xhr-request":function(e,t="",r=null,n="replace"){const o=ze(arguments),s=Qe("replace-xhr-request"),{mark:i,end:a}=We("replace-xhr-request");if(!e)throw new To("[replace-xhr-request]: Missing 'search' parameter");function c(e){try{return jo.parse(e)}catch(t){return e}}function l(e,t,r){let n=e[t];So.isArray(n)?So.isArray(r)?e[t]=Pe(n).concat(r):Pe(n).push(r):"object"!=typeof n||null===n||"object"!=typeof r||null===r||So.isArray(r)?e[t]="string"==typeof n?n+Pe(r).toString():r:ko.assign(n,r)}var u;if($o||($o=new Map,s("info","XMLHttpRequest proxied"),u=e=>{i();let t=e;for(const[r,{replacement:n,needle:o,formattedArgs:i,isJsonPath:a,jsonPathEngine:u,mode:p}]of $o){if(o){if(!qe(o).test(t))continue;s("info",`'${o}' found in XHR request body`)}if(a)try{let e=jo.parse(t);const r=u.evaluate(e);Pe(r).forEach((({parent:e,key:t})=>{let r=c(n);"append"===p?l(e,t,r):e[t]=r,s("success",`JSONPath [${p}] at [${t}] with `+n,"\nFILTER: replace-xhr-request "+i)})),t=jo.stringify(e)}catch(e){s("info","JSONPath: skipping non-JSON body or evaluation error: "+e.message)}else t=Pe(t).replace(r,n).toString(),e.toString()!==t.toString()&&s("success",`'${r}' replaced with '${n}' in XHR request body`,"\nFILTER: replace-xhr-request "+i)}return a(),t},mo.push(u),Eo()),Pe(e).startsWith("jsonpath(")){let i;try{const t=Pe(e).slice(9,-1).toString();i=new hn(t)}catch(t){return void s("error",`Invalid JSONPath query: ${e}. Error: ${t.message}`)}$o.set(e,{replacement:t,needle:r,formattedArgs:o,isJsonPath:!0,jsonPathEngine:i,mode:n})}else{const s=qe(e),i=new xo(s,"g");$o.set(i,{replacement:t,needle:r,formattedArgs:o,isJsonPath:!1,jsonPathEngine:null,mode:n})}},"replace-xhr-response":function(e,t="",r=null){const n=ze(arguments),o=Qe("replace-xhr-response"),{mark:s,end:i}=We("replace-xhr-response");var a;if(e)if(Ro||(Ro=new Map,o("info","XMLHttpRequest proxied"),a=e=>{s();let t=e;for(const[r,{replacement:n,needle:s,formattedArgs:i,isJsonPath:a,jsonPathEngine:c}]of Ro){if(s){if(!qe(s).test(t)){Ve()&&(console.groupCollapsed(`DEBUG [replace-xhr-response] warn: '${s}' not found in XHR response`),o("warn",t),console.groupEnd());continue}Ve()&&(console.groupCollapsed(`DEBUG [replace-xhr-response] success: '${s}' found in XHR response`),o("info",t),console.groupEnd())}if(a)try{let e=Po.parse(t);const r=c.evaluate(e);Pe(r).forEach((({parent:e,key:t})=>{e[t]=$t(n),o("success",`JSONPath match at [${t}], replaced with `+n,"\nFILTER: replace-xhr-response "+i)})),t=Po.stringify(e)}catch(e){o("info","JSONPath: skipping non-JSON response or evaluation error: "+e.message)}else t=Pe(t).replace(r,n).toString(),Ve()&&e.toString()!==t.toString()&&(console.groupCollapsed(`DEBUG [replace-xhr-response] success: '${r}' replaced with '${n}' in XHR response`,"\nFILTER: replace-xhr-response "+i),o("success",t),console.groupEnd())}return i(),t.toString()},vo.push(a),Eo()),Pe(e).startsWith("jsonpath(")){let s;try{const t=Pe(e).slice(9,-1).toString();s=new hn(t)}catch(t){return void o("error",`Invalid JSONPath query: ${e}. Error: ${t.message}`)}Ro.set(e,{replacement:t,needle:r,formattedArgs:n,isJsonPath:!0,jsonPathEngine:s})}else{const o=qe(e),s=new Ao(o,"g");Ro.set(s,{replacement:t,needle:r,formattedArgs:n,isJsonPath:!1,jsonPathEngine:null})}else o("error","The parameter 'pattern' is required")},"strip-fetch-query-parameter":function(e,t=null){const r=ze(arguments),n=Qe("strip-fetch-query-parameter"),{mark:o,end:s}=We("strip-fetch-query-parameter"),i=e=>{o();for(let[t,r]of Oo.entries()){const{reg:o,args:s}=r;o&&!o.test(e)||Mo(e.searchParams,t)&&(n("success",`${t} has been stripped from url ${e}`,`\nFILTER: strip-fetch-query-parameter ${s}`),Lo(e.searchParams,t))}s()};var a;Oo||(Oo=new Map,a=i,to.push(a),no()),Oo.set(e,{reg:t&&qe(t),args:r})},"timer-override":function(e,t="",r="",n=Jo.BOTH,s=""){if(!e)throw new No("[timer-override snippet]: Missing required parameter timerValue.");if(!Io.values(Jo).includes(n))throw new No("[timer-override snippet]: Invalid mode. Acceptable values are: "+Io.values(Jo).join(", "));const a=Co(e,10);if(Wo(a))throw new No("[timer-override snippet]: timerValue must be a number.");if(!qo){qo=Pe([]);const u=Qe("timer-override"),{mark:p,end:f}=We("timer-override");function d(e){try{return"function"==typeof e?i(Fo,e):""+e}catch(e){return""}}function h(e,t,r,n,s,i,a){const c=d(s);for(const l of qo){if(n.indexOf(l.mode)<0)continue;if(l.needleRegex){const e=""+i;if(!l.needleRegex.test(c)&&!l.needleRegex.test(e))continue;u("info",l.needle+" found in "+c)}if(l.stackNeedles.length>0&&!St(l.stackNeedles,u))continue;let p=s;const f=l.newDelay;l.isNoop&&(p=()=>{},u("success","Callback replaced with noop for "+c)),u("success",r+" replaced with "+f+" for "+c);const d=Pe([p,f]);for(let e=2;e<a.length;e++)d.push(a[e]);return o(t,e,d)}return null}p();const g=Pe([Jo.TIMEOUT,Jo.BOTH]);Io.defineProperty(window,"setTimeout",{value:l(Do,(function(e,t){const r=h(this,Do,"setTimeout",g,e,t,arguments);return null!==r?r:o(Do,this,arguments)}))});const y=Pe([Jo.INTERVAL,Jo.BOTH]);Io.defineProperty(window,"setInterval",{value:l(Ho,(function(e,t){const r=h(this,Ho,"setInterval",y,e,t,arguments);return null!==r?r:o(Ho,this,arguments)}))}),u("info","timer APIs proxied"),f()}let c=[];s&&(c=s.split(/ +/)),qo.push({newDelay:a,needle:t,needleRegex:t?qe(t):null,mode:n,isNoop:"noop"===r,stackNeedles:c,formattedArgs:ze(arguments)})},trace:function(...e){o(Ke,null,e)}};
const snippets=Bo;
let context;
for (const [name, ...args] of filters) {
if (snippets.hasOwnProperty(name)) {
try { context = snippets[name].apply(context, args); }
catch (error) { console.error(error); }
}
}
context = void 0;
};
const graph = new Map([["abort-current-inline-script",null],["abort-on-iframe-property-read",null],["abort-on-iframe-property-write",null],["abort-on-property-read",null],["abort-on-property-write",null],["array-override",null],["blob-override",null],["cookie-remover",null],["profile",null],["debug",null],["event-override",null],["freeze-element",null],["hide-if-canvas-contains",null],["hide-if-shadow-contains",null],["json-override",null],["json-prune",null],["map-override",null],["override-property-read",null],["prevent-element-src-loading",null],["prevent-listener",null],["replace-fetch-response",null],["replace-outbound-value",null],["replace-xhr-request",null],["replace-xhr-response",null],["strip-fetch-query-parameter",null],["timer-override",null],["trace",null]]);
callback.get = snippet => graph.get(snippet);
callback.has = snippet => graph.has(snippet);
callback.getGraph = () => graph;
callback.setEnvironment = env => {
  if (typeof currentEnvironment !== "undefined")
    currentEnvironment = env;
};
callback.setDebugStyle = styles => {
  if (typeof currentEnvironment !== "undefined")
  {
    delete currentEnvironment.initial;
    currentEnvironment.debugCSSProperties = styles;
  }
    
};
callback.getEnvironment = () => currentEnvironment;
/* harmony default export */ const main = (callback);
;// ./src/content/shared/constants.js
/*
 * This file is part of eyeo's Web Extension Ad Blocking Toolkit (EWE),
 * Copyright (C) 2006-present eyeo GmbH
 *
 * EWE is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * EWE is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with EWE.  If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * Prefix that should be used for storage and synchronization to avoid conflicts
 * when multiple extensions are installed in the same session.
 *
 * !!! IMPORTANT - DO NOT CHANGE THIS VALUE !!!
 * This exact string "ab" is hardcoded in the build
 * configurations and is replaced during the build process with host-specific
 * values (e.g., "ab" for Adblock, "abp" for Adblock Plus).
 *
 * If you change this value, the build process will NOT replace it, and the
 * extension will fail to work properly due to namespace conflicts.
 *
 * Build configuration references:
 * - host/adblock/build/config/base.mjs (replacements.search)
 * - host/adblockplus/build/webext/config/base.mjs (replacements.search)
 *
 * @type {string}
 */
const HOST_PREFIX_TO_REPLACE = "ab";

/**
 * Dataset key used to exchange the communication channel name between content
 * scripts in different contexts (main world and isolated world)
 * @type {string}
 */
const COMMS_CHANNEL_DATASET_KEY = `${HOST_PREFIX_TO_REPLACE}FiltersChannel`;

/**
 * Event used to communicate between content script contexts
 * @type {string}
 */
const HANDSHAKE_EVENT_NAME = `${HOST_PREFIX_TO_REPLACE}-handshake`;

/**
 * Storage key used to cache the filters config in content scripts
 * @type {string}
 */
const CACHED_FILTERS_CONFIG_KEY = `${HOST_PREFIX_TO_REPLACE}-filters-config`;

/**
 * CSS properties applied to elements hidden in debug mode
 * @type {string[][]}
 */
const DEBUG_CSS_PROPERTIES = [
  ["background", "repeating-linear-gradient(to bottom, #e67370 0, #e67370 9px, white 9px, white 10px)"],
  ["outline", "solid red"]
];

;// ./src/content/main/shims/storage.js
/*
 * This file is part of eyeo's Web Extension Ad Blocking Toolkit (EWE),
 * Copyright (C) 2006-present eyeo GmbH
 *
 * EWE is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * EWE is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with EWE.  If not, see <http://www.gnu.org/licenses/>.
 */

/* eslint-disable no-extend-native */

function shimStorage(CACHED_FILTERS_CONFIG_KEY) {
  // =================== Secured copies of native functions ====================
  // These are captured before page scripts run.
  // Used inside Proxy apply handlers which run after page scripts.
  const {parse: $JSONparse, stringify: $JSONstringify} = JSON;
  const {keys: $ObjectKeys} = Object;
  const {
    apply: $ReflectApply,
    ownKeys: $ReflectOwnKeys,
    get: $ReflectGet,
    set: $ReflectSet,
    has: $ReflectHas,
    getOwnPropertyDescriptor: $ReflectGetOwnPropertyDescriptor,
    defineProperty: $ReflectDefineProperty,
    deleteProperty: $ReflectDeleteProperty
  } = Reflect;
  const {filter: $ArrayFilter} = Array.prototype;
  const {get: $MapGet, set: $MapSet, has: $MapHas} = Map.prototype;
  const $String = String;

  // Helpers using secured copies
  const filter = (arr, fn) => $ReflectApply($ArrayFilter, arr, [fn]);
  const mapGet = (map, key) => $ReflectApply($MapGet, map, [key]);
  const mapSet = (map, key, val) => $ReflectApply($MapSet, map, [key, val]);
  const mapHas = (map, key) => $ReflectApply($MapHas, map, [key]);

  // Need to unwrap our own proxies when multiple extensions run this shim.
  const realLocalStorage = window.localStorage;
  const realSessionStorage = window.sessionStorage;
  let localStorageProxy;
  let sessionStorageProxy;
  function unwrapStorage(storage) {
    if (storage === localStorageProxy) {
      return realLocalStorage;
    }
    if (storage === sessionStorageProxy) {
      return realSessionStorage;
    }
    return storage;
  }

  const originalToStrings = new Map();

  const storageGetItemDesc = Object.getOwnPropertyDescriptor(
    Storage.prototype, "getItem"
  );
  const originalStorageGetItem = storageGetItemDesc.value;

  // =================== Conditional application of the shim ===================
  function shouldShimStorage() {
    const config = getConfig(window.sessionStorage) ||
      getConfig(window.localStorage);
    return Boolean(config);
  }

  if (!shouldShimStorage()) {
    return;
  }

  // ===================== Storage.prototype.getItem ======================
  // @docs https://developer.mozilla.org/en-US/docs/Web/API/Storage/getItem
  function getConfig(storage) {
    try {
      const configSerialized = $ReflectApply(
        originalStorageGetItem, unwrapStorage(storage),
        [CACHED_FILTERS_CONFIG_KEY]
      );
      if (configSerialized) {
        return $JSONparse(configSerialized);
      }
    }
    catch (e) {
      // If we can't parse, return null
    }
    return null;
  }

  function websiteHasValue(config) {
    return config && typeof config.websiteValue === "string";
  }
  const storageGetItemProxy = new Proxy(originalStorageGetItem, {
    apply(target, thisArg, argumentsList) {
      const key = argumentsList[0];
      const unwrappedThis = unwrapStorage(thisArg);
      if (key === CACHED_FILTERS_CONFIG_KEY) {
        const config = getConfig(unwrappedThis);
        if (websiteHasValue(config)) {
          return config.websiteValue;
        }
        return null;
      }
      return $ReflectApply(target, unwrappedThis, argumentsList);
    }
  });
  Object.defineProperty(Storage.prototype, "getItem", {
    ...storageGetItemDesc,
    value: storageGetItemProxy
  });
  mapSet(
    originalToStrings,
    storageGetItemProxy,
    originalStorageGetItem.toString.bind(originalStorageGetItem)
  );

  // ===================== Storage.prototype.setItem ===========================
  // @docs https://developer.mozilla.org/en-US/docs/Web/API/Storage/setItem
  const storageSetItemDesc = Object.getOwnPropertyDescriptor(
    Storage.prototype, "setItem"
  );
  const originalStorageSetItem = storageSetItemDesc.value;
  const storageSetItemProxy = new Proxy(originalStorageSetItem, {
    apply(target, thisArg, argumentsList) {
      const key = argumentsList[0];
      const unwrappedThis = unwrapStorage(thisArg);
      if (key === CACHED_FILTERS_CONFIG_KEY) {
        const config = getConfig(unwrappedThis) || {};
        config.websiteValue = $String(argumentsList[1]);
        $ReflectApply(
          target,
          unwrappedThis,
          [CACHED_FILTERS_CONFIG_KEY, $JSONstringify(config)]
        );
        return void 0;
      }
      return $ReflectApply(target, unwrappedThis, argumentsList);
    }
  });
  Object.defineProperty(Storage.prototype, "setItem", {
    ...storageSetItemDesc,
    value: storageSetItemProxy
  });
  mapSet(
    originalToStrings,
    storageSetItemProxy,
    originalStorageSetItem.toString.bind(originalStorageSetItem)
  );

  // ================== Storage.prototype.removeItem ==========================
  // @docs https://developer.mozilla.org/en-US/docs/Web/API/Storage/removeItem
  const storageRemoveItemDesc = Object.getOwnPropertyDescriptor(
    Storage.prototype, "removeItem"
  );
  const originalStorageRemoveItem = storageRemoveItemDesc.value;
  const storageRemoveItemProxy = new Proxy(originalStorageRemoveItem, {
    apply(target, thisArg, argumentsList) {
      const key = argumentsList[0];
      const unwrappedThis = unwrapStorage(thisArg);
      if (key === CACHED_FILTERS_CONFIG_KEY) {
        const config = getConfig(unwrappedThis);
        if (websiteHasValue(config)) {
          delete config.websiteValue;
          $ReflectApply(
            originalStorageSetItem,
            unwrappedThis, [CACHED_FILTERS_CONFIG_KEY, $JSONstringify(config)]
          );
        }
        return void 0;
      }
      return $ReflectApply(target, unwrappedThis, argumentsList);
    }
  });
  Object.defineProperty(Storage.prototype, "removeItem", {
    ...storageRemoveItemDesc,
    value: storageRemoveItemProxy
  });
  mapSet(
    originalToStrings,
    storageRemoveItemProxy,
    originalStorageRemoveItem.toString.bind(originalStorageRemoveItem)
  );

  // ==================== Storage.prototype.clear ============================
  // @docs https://developer.mozilla.org/en-US/docs/Web/API/Storage/clear
  const storageClearDesc = Object.getOwnPropertyDescriptor(
    Storage.prototype, "clear"
  );
  const originalStorageClear = storageClearDesc.value;
  const storageClearProxy = new Proxy(originalStorageClear, {
    apply(target, thisArg, argumentsList) {
      const unwrappedThis = unwrapStorage(thisArg);
      const config = getConfig(unwrappedThis);
      if (config) {
        delete config.websiteValue;
      }

      $ReflectApply(target, unwrappedThis, argumentsList);

      // Restore our config (without websiteValue)
      if (config && $ObjectKeys(config).length > 0) {
        $ReflectApply(
          originalStorageSetItem,
          unwrappedThis, [CACHED_FILTERS_CONFIG_KEY, $JSONstringify(config)]
        );
      }
      return void 0;
    }
  });
  Object.defineProperty(Storage.prototype, "clear", {
    ...storageClearDesc,
    value: storageClearProxy
  });
  mapSet(
    originalToStrings,
    storageClearProxy,
    originalStorageClear.toString.bind(originalStorageClear)
  );

  // ===================== Storage.prototype.key ===============================
  // @docs https://developer.mozilla.org/en-US/docs/Web/API/Storage/key
  const storageKeyDesc = Object.getOwnPropertyDescriptor(
    Storage.prototype, "key"
  );
  const originalStorageKey = storageKeyDesc.value;
  const storageKeyProxy = new Proxy(originalStorageKey, {
    apply(target, thisArg, argumentsList) {
      const unwrappedThis = unwrapStorage(thisArg);
      const config = getConfig(unwrappedThis);
      if (!config || websiteHasValue(config)) {
        return $ReflectApply(target, unwrappedThis, argumentsList);
      }

      const requestedIndex = argumentsList[0];
      for (let i = 0; i <= requestedIndex; i++) {
        const key = $ReflectApply(target, unwrappedThis, [i]);
        if (key === CACHED_FILTERS_CONFIG_KEY) {
          return $ReflectApply(target, unwrappedThis, [requestedIndex + 1]);
        }
      }
      return $ReflectApply(target, unwrappedThis, argumentsList);
    }
  });
  Object.defineProperty(Storage.prototype, "key", {
    ...storageKeyDesc,
    value: storageKeyProxy
  });
  mapSet(
    originalToStrings,
    storageKeyProxy,
    originalStorageKey.toString.bind(originalStorageKey)
  );

  // =================== Storage.prototype.length ============================
  // @docs https://developer.mozilla.org/en-US/docs/Web/API/Storage/length
  const storageLengthDesc = Object.getOwnPropertyDescriptor(
    Storage.prototype, "length"
  );
  const originalStorageLengthGetter = storageLengthDesc.get;
  Object.defineProperty(Storage.prototype, "length", {
    ...storageLengthDesc,
    get() {
      const unwrappedThis = unwrapStorage(this);
      const originalLength =
        $ReflectApply(originalStorageLengthGetter, unwrappedThis, []);
      const config = getConfig(unwrappedThis);
      if (config && !websiteHasValue(config)) {
        return originalLength - 1;
      }
      return originalLength;
    }
  });

  // ================== Proxy wrapper for localStorage ===========
  // Handles: {...localStorage}, Object.keys(), Object.values(), for...in, etc.
  const methodProxyCache = new Map();

  function getMethodProxy(storage, method) {
    if (mapHas(methodProxyCache, method)) {
      return mapGet(methodProxyCache, method);
    }
    const methodProxy = new Proxy(method, {
      apply(fn, _, args) {
        return $ReflectApply(fn, storage, args);
      }
    });
    mapSet(methodProxyCache, method, methodProxy);
    // Register toString for the wrapper to preserve function name
    const originalMethod = mapGet(originalToStrings, method);
    if (originalMethod) {
      mapSet(originalToStrings, methodProxy, originalMethod);
    }
    return methodProxy;
  }

  const storageInstanceProxyConfig = {
    ownKeys(target) {
      const keys = $ReflectOwnKeys(target);
      const config = getConfig(target);
      if (config && !websiteHasValue(config)) {
        return filter(keys, key => key !== CACHED_FILTERS_CONFIG_KEY);
      }
      return keys;
    },

    // Required for spread operator
    getOwnPropertyDescriptor(target, prop) {
      if (prop === CACHED_FILTERS_CONFIG_KEY) {
        const config = getConfig(target);
        if (config && !websiteHasValue(config)) {
          return void 0; // Hide the property entirely
        }
        // When website has set a value, return a proper enumerable descriptor
        // with the website's value (not our internal config)
        if (websiteHasValue(config)) {
          return {
            value: config.websiteValue,
            writable: true,
            enumerable: true,
            configurable: true
          };
        }
      }
      return $ReflectGetOwnPropertyDescriptor(target, prop);
    },

    // Needed for 'in' operator
    has(target, prop) {
      if (prop === CACHED_FILTERS_CONFIG_KEY) {
        const config = getConfig(target);
        if (config && !websiteHasValue(config)) {
          return false;
        }
      }
      return $ReflectHas(target, prop);
    },

    // Forward get/set using original target so native methods work correctly
    get(target, prop) {
      if (prop === CACHED_FILTERS_CONFIG_KEY) {
        return target.getItem(CACHED_FILTERS_CONFIG_KEY);
      }
      // Return correct toStringTag so Object.prototype.toString returns
      // [object Storage] instead of [object Object] (for older Firefox)
      if (prop === Symbol.toStringTag) {
        return "Storage";
      }
      const value = $ReflectGet(target, prop, target);
      // For methods, wrap in a proxy to bind `this` to original target
      // while preserving toString behavior
      if (typeof value === "function") {
        return getMethodProxy(target, value);
      }
      return value;
    },

    set(target, prop, value) {
      if (prop === CACHED_FILTERS_CONFIG_KEY) {
        target.setItem(CACHED_FILTERS_CONFIG_KEY, value);
        return true;
      }
      return $ReflectSet(target, prop, value, target);
    },

    defineProperty(target, prop, descriptor) {
      if (prop === CACHED_FILTERS_CONFIG_KEY) {
        if ("value" in descriptor) {
          target.setItem(CACHED_FILTERS_CONFIG_KEY, descriptor.value);
        }
        return true;
      }
      return $ReflectDefineProperty(target, prop, descriptor);
    },

    deleteProperty(target, prop) {
      if (prop === CACHED_FILTERS_CONFIG_KEY) {
        target.removeItem(CACHED_FILTERS_CONFIG_KEY);
        return true;
      }
      return $ReflectDeleteProperty(target, prop);
    }
  };

  localStorageProxy = new Proxy(
    window.localStorage,
    storageInstanceProxyConfig
  );

  Object.defineProperty(window, "localStorage", {
    value: localStorageProxy,
    writable: false,
    configurable: true,
    enumerable: true
  });

  sessionStorageProxy = new Proxy(
    window.sessionStorage,
    storageInstanceProxyConfig
  );

  Object.defineProperty(window, "sessionStorage", {
    value: sessionStorageProxy,
    writable: false,
    configurable: true,
    enumerable: true
  });

  // ===================== Function.prototype.toString =========================
  // @docs https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/toString
  const functionToStringDesc = Object.getOwnPropertyDescriptor(
    Function.prototype, "toString"
  );
  const originalFunctionToString = functionToStringDesc.value;
  const functionToStringProxy = new Proxy(originalFunctionToString, {
    apply(target, thisArg, argumentsList) {
      // Call "super" first, just in case the function was overwritten and had
      // checks if it was called
      const r = $ReflectApply(target, thisArg, argumentsList);

      const restoredToString = mapGet(originalToStrings, thisArg);
      if (restoredToString) {
        return $ReflectApply(restoredToString, thisArg, argumentsList);
      }

      return r;
    }
  });
  Object.defineProperty(Function.prototype, "toString", {
    ...functionToStringDesc,
    value: functionToStringProxy
  });
  mapSet(
    originalToStrings,
    functionToStringProxy,
    originalFunctionToString.toString.bind(originalFunctionToString)
  );
}

;// ./src/content/shared/helpers.js
/*
 * This file is part of eyeo's Web Extension Ad Blocking Toolkit (EWE),
 * Copyright (C) 2006-present eyeo GmbH
 *
 * EWE is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * EWE is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with EWE.  If not, see <http://www.gnu.org/licenses/>.
 */



/**
 * Claims a communication channel name from the document's dataset.
 *
 * If a channel name already exists in the dataset, it is consumed (removed
 * from the dataset and returned). If no channel name exists, the fallback
 * channel is stored in the dataset and returned.
 *
 * This mechanism ensures that only one content script can claim the
 * channel name at a time, preventing conflicts when the main world
 * and isolated world scripts execution order is not consistent.
 * @see https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/139#changes_for_add-on_developers
 * @see https://bugzil.la/1792685
 * @see https://eyeo.atlassian.net/wiki/spaces/B2C/pages/1666678786/Content-script+based+snippets
 *
 * @param {string} fallbackChannel - The channel name to use and store if
 *   none is present.
 * @returns {string} The claimed channel name (either the existing one
 *   or the fallback).
 */
function claimCommsChannel(fallbackChannel) {
  let channelName = document.documentElement.dataset[COMMS_CHANNEL_DATASET_KEY];

  if (!channelName) {
    channelName = fallbackChannel;
    document.documentElement.dataset[COMMS_CHANNEL_DATASET_KEY] = channelName;
  }
  else {
    delete document.documentElement.dataset[COMMS_CHANNEL_DATASET_KEY];
  }

  return channelName;
}

;// ./src/all/errors.js
/*
 * This file is part of eyeo's Web Extension Ad Blocking Toolkit (EWE),
 * Copyright (C) 2006-present eyeo GmbH
 *
 * EWE is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * EWE is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with EWE.  If not, see <http://www.gnu.org/licenses/>.
 */

const ERROR_NO_CONNECTION = (/* unused pure expression or super */ null && ("Could not establish connection. " +
      "Receiving end does not exist."));
const ERROR_CLOSED_CONNECTION = (/* unused pure expression or super */ null && ("A listener indicated an asynchronous " +
      "response by returning true, but the message channel closed before a " +
      "response was received"));
// https://bugzilla.mozilla.org/show_bug.cgi?id=1578697
const ERROR_MANAGER_DISCONNECTED = "Message manager disconnected";

/**
 * Reconstructs an error from a serializable error object
 *
 * @param {Object} errorData - Error object
 *
 * @returns {Error} error
 */
function fromSerializableError(errorData) {
  const error = new Error(errorData.message);
  error.cause = errorData.cause;
  error.name = errorData.name;
  error.stack = errorData.stack;

  return error;
}

/**
 * Filters out `browser.runtime.sendMessage` errors to do with the receiving end
 * no longer existing.
 *
 * @param {Promise} promise The promise that should have "no connection" errors
 *   ignored. Generally this would be the promise returned by
 *   `browser.runtime.sendMessage`.
 * @return {Promise} The same promise, but will resolve with `undefined` instead
 *   of rejecting if the receiving end no longer exists.
 */
function ignoreNoConnectionError(promise) {
  return promise.catch(error => {
    if (typeof error == "object" &&
        (error.message == ERROR_NO_CONNECTION ||
         error.message == ERROR_CLOSED_CONNECTION ||
         error.message == ERROR_MANAGER_DISCONNECTED)) {
      return;
    }

    throw error;
  });
}

/**
 * Creates serializable error object from given error
 *
 * @param {Error} error - Error
 *
 * @returns {Object} serializable error object
 */
function toSerializableError(error) {
  return {
    cause: error.cause instanceof Error ?
      toSerializableError(error.cause) :
      error.cause,
    message: error.message,
    name: error.name,
    stack: error.stack
  };
}

;// ./src/content/main/snippets.entry.js
/*
 * This file is part of eyeo's Web Extension Ad Blocking Toolkit (EWE),
 * Copyright (C) 2006-present eyeo GmbH
 *
 * EWE is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * EWE is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with EWE.  If not, see <http://www.gnu.org/licenses/>.
 */

/* global chrome browser */








// Use chrome.storage to detect if we're in an isolated world.
// Note: chrome.runtime is unreliable since other extensions may expose it
// in the main world.
const isMainWorld = !(
  (typeof chrome === "object" && !!chrome.storage) ||
  (typeof browser === "object" && !!browser.storage)
);

// Get or create a unique channel name for communicating with the isolated world
const commsChannelName = claimCommsChannel(esm_browser_v4());

const runStorageShim = (shimFn, configKey) => {
  try {
    if (typeof shimFn === "function" && configKey) {
      shimFn(configKey);
    }
  }
  catch (err) {
    // It would be good to report this error to Sentry, but we don't currently
    // have a way to do that from the main world.
  }
};

const runSnippets = snippetsConfig => {
  const {callback, filters, env, commsChannel, serializeError} = snippetsConfig;

  if (filters.length) {
    try {
      callback(env, ...filters);
    }
    catch (e) {
      // It would be good to report this error to Sentry, but we don't currently
      // have a way to do that from the main world.
      const errorEvent = new CustomEvent(commsChannel, {
        detail: {
          type: "ewe:main-error",
          error: serializeError(e)
        }
      });
      document.dispatchEvent(errorEvent);
    }
  }
};

const createTrustedScriptPolicy = () => {
  const isTrustedTypesSupported = typeof trustedTypes !== "undefined";
  let policy = null;

  try {
    if (isTrustedTypesSupported) {
      policy = trustedTypes.createPolicy(esm_browser_v4(), {
        createScript: code => code,
        createScriptURL: url => url
      });
    }
  }
  catch (_) {
  }
  return policy;
};

const injectScript = (executable, policy) => {
  const script = document.createElement("script");
  script.type = "application/javascript";
  script.async = false;

  if (policy) {
    script.textContent = policy.createScript(executable);
  }
  else {
    script.textContent = executable;
  }

  try {
    document.documentElement.appendChild(script);
  }
  catch (_) {}
  document.documentElement.removeChild(script);
};

const appendSnippets = snippetsConfig => {
  const policy = createTrustedScriptPolicy();
  const {
    callback,
    filters,
    env,
    shimFn,
    shimConfigKey,
    commsChannel,
    serializeError
  } = snippetsConfig;

  const snippetsCode = filters.length ? `
    const callback = (${callback});
    const runSnippets = (${runSnippets});
    const serializeError = (${serializeError});
    const snippetsConfig = {
      callback,
      env: ${JSON.stringify(env)},
      filters: ${JSON.stringify(filters)},
      commsChannel: "${commsChannel}",
      serializeError
    };
    runSnippets(snippetsConfig);
  ` : "";

  const code = `(function () {
    const shimFn = (${shimFn});
    const shimConfigKey = "${shimConfigKey}";
    const runStorageShim = (${runStorageShim});
    runStorageShim(shimFn, shimConfigKey);
    ${snippetsCode}
  })();`;

  injectScript(code, policy);
};

const onFiltersReceived = event => {
  if (!event || !event.detail) {
    return;
  }

  const {type, filters, debug} = event.detail;

  // ignore other events that are not related to filters config
  if (type !== "ewe:filters-config") {
    return;
  }

  // Check which snippets need to be executed in the main world.
  const mainSnippets = [];
  for (const filter of filters) {
    for (const [name, ...args] of filter) {
      if (main.has(name)) {
        mainSnippets.push([name, ...args]);
      }
    }
  }

  // sendDetectionEvent is intentionally not included in the main world env.
  // Detection events rely on ServerLogger and Sentry, which require extension
  // API access only available in the isolated world. See snippet-events.js.
  const snippetsConfig = {
    callback: main,
    env: {debugCSSProperties: debug ? DEBUG_CSS_PROPERTIES : null},
    filters: mainSnippets,
    shimFn: shimStorage,
    shimConfigKey: CACHED_FILTERS_CONFIG_KEY,
    commsChannel: commsChannelName,
    serializeError: toSerializableError
  };

  // If this script is injected into the main world we can execute directly.
  // If we are on isolated world (MV2), we need to create an inline script to
  // inject the snippets into page context.
  if (isMainWorld) {
    runStorageShim(shimStorage, CACHED_FILTERS_CONFIG_KEY);
    runSnippets(snippetsConfig);
  }
  else {
    appendSnippets(snippetsConfig);
  }
};

document.addEventListener(commsChannelName, onFiltersReceived);
document.dispatchEvent(new CustomEvent(HANDSHAKE_EVENT_NAME));

/******/ })()
;
