(function (root) {
  "use strict";
  const TYPES = {
    select: { host: ".el-select", popup: ".el-select-dropdown", option: ".el-select-dropdown__item" },
    cascader: { host: ".el-cascader", popup: ".el-cascader__dropdown", option: ".el-cascader-node" },
    autocomplete: { host: ".el-autocomplete", popup: ".el-autocomplete-suggestion", option: "li" },
  };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const compact = value => String(value ?? "").replace(/\s+/g, "").trim();
  const aliases = [
    ["硕士", "硕士研究生", "研究生（硕士）"], ["本科", "大学本科"],
    ["博士", "博士研究生"], ["大专", "大学专科", "专科"],
    ["共青团员", "团员"], ["中共党员", "党员"],
    ["统招全日制", "普通全日制", "全日制"], ["学士", "学士学位"],
    ["国家级", "国家"], ["省级", "省部级"],
  ];
  function visible(el) {
    if (!el || !el.isConnected) return false;
    const style = el.ownerDocument.defaultView.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && el.getClientRects().length > 0;
  }
  function identify(el) {
    if (el?.tagName?.toLowerCase() !== "input") return null;
    for (const [type, spec] of Object.entries(TYPES)) {
      const host = el.closest(spec.host);
      if (host) return { type, host, el, spec };
    }
    return null;
  }
  function getLabel(el) {
    const item=el.closest('.el-form-item');
    const label=item?.querySelector(':scope > .el-form-item__label');
    return String(label?.textContent||'').replace(/^[＊*\s]+|[：:\s]+$/g,'').trim();
  }
  function disabled(el) {
    return Boolean(el?.disabled || el?.getAttribute?.("aria-disabled") === "true" ||
      el?.classList?.contains("is-disabled") || el?.classList?.contains("disabled"));
  }
  function label(el) {
    return String(el.querySelector?.(".el-cascader-node__label")?.textContent || el.textContent || "").trim();
  }
  function equivalent(a, b) {
    const x=compact(a), y=compact(b);
    return x === y || aliases.some(group => group.includes(x) && group.includes(y));
  }
  function chooseOption(options, desired) {
    const usable = options.filter(option => !disabled(option));
    const exact = usable.filter(option => compact(label(option)) === compact(desired));
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) return null;
    const similar = usable.filter(option => equivalent(label(option), desired));
    if (similar.length === 1) return similar[0];
    const ratio = String(desired).match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
    if (ratio && +ratio[1] > 0 && +ratio[2] >= +ratio[1]) {
      const pct=100*Number(ratio[1])/Number(ratio[2]);
      const buckets=usable.map(option=>({option,match:label(option).match(/^前\s*(\d+(?:\.\d+)?)\s*%$/)}))
        .filter(item=>item.match && Number(item.match[1])>=pct).sort((a,b)=>Number(a.match[1])-Number(b.match[1]));
      if (buckets.length && (buckets.length===1 || buckets[0].match[1]!==buckets[1].match[1])) return buckets[0].option;
    }
    return null;
  }
  async function waitFor(check, timeout=4500) {
    const end=Date.now()+timeout;
    while (Date.now()<end) { const result=check(); if(result) return result; await sleep(60); }
    return null;
  }
  function click(el) {
    el.scrollIntoView?.({block:"nearest",inline:"nearest"});
    el.dispatchEvent(new MouseEvent("mousedown",{bubbles:true}));
    el.dispatchEvent(new MouseEvent("mouseup",{bubbles:true}));
    el.click();
  }
  function setQuery(el, value) {
    const setter=Object.getOwnPropertyDescriptor(el.ownerDocument.defaultView.HTMLInputElement.prototype,"value")?.set;
    if(setter) setter.call(el,value); else el.value=value;
    el.dispatchEvent(new Event("input",{bubbles:true}));
  }
  function popups(control) {
    return Array.from(control.el.ownerDocument.querySelectorAll(control.spec.popup)).filter(visible);
  }
  function ownedPopup(control) {
    for (const node of [control.el,control.host]) {
      for(const attr of ["aria-controls","aria-owns"]) {
        const ids=(node.getAttribute(attr)||"").split(/\s+/).filter(Boolean);
        for(const id of ids) {
          const target=control.el.ownerDocument.getElementById(id);
          const popup=target?.matches(control.spec.popup)?target:target?.closest(control.spec.popup);
          if(visible(popup)) return popup;
        }
      }
    }
    const inside=control.host.querySelector(control.spec.popup);
    return visible(inside)?inside:null;
  }
  async function open(control) {
    const owned=ownedPopup(control);
    if(owned) return owned;
    const before=new Set(popups(control));
    if(control.el===control.el.ownerDocument.activeElement && control.host.querySelector(".is-reverse") && before.size===1) return [...before][0];
    click(control.el);
    return waitFor(()=>{
      const direct=ownedPopup(control); if(direct) return direct;
      const fresh=popups(control).filter(p=>!before.has(p));
      return fresh.length===1?fresh[0]:null;
    });
  }
  function close(control,popup) {
    if(!visible(popup)) return;
    if(control.type==='autocomplete') control.el.blur(); else click(control.el);
  }
  function options(control,popup) {
    return Array.from(popup.querySelectorAll(control.spec.option)).filter(node=>visible(node)&&!disabled(node));
  }
  function splitTail(text, optionLabel) {
    const value=compact(text).replace(/[\s/\\>,，、·-]/g,"");
    const full=compact(optionLabel);
    const short=full.replace(/(?:特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|自治州|地区|省|市|区|县)$/u,"");
    for(const candidate of [full,short].filter(Boolean)) {
      if(value.startsWith(candidate)) return value.slice(candidate.length).replace(/^(?:特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|自治州|地区|省|市|区|县)/u,"");
    }
    return null;
  }
  function resolveValue(runtime,value,profile,resumePath) {
    if(runtime.controlType!=="cascader") return value;
    const contact=profile?.contactAndLocation||{}, personal=profile?.personal||{};
    if(/^contactAndLocation\.hometown/.test(resumePath)) {
      return [contact.hometownProvince,contact.hometownCity,contact.hometownDistrict].filter(Boolean).join("/")||value;
    }
    if(/^personal\.current(?:City|Province|District)$/.test(resumePath)) {
      return [...new Set([personal.currentProvince,personal.currentCity,personal.currentDistrict].filter(Boolean))].join("/")||value;
    }
    return value;
  }
  async function fillCascade(control,popup,desired) {
    let remaining=String(desired), chosen=[];
    for(let depth=0;depth<6;depth++) {
      const menu=await waitFor(()=>Array.from(popup.querySelectorAll('.el-cascader-menu')).filter(visible)[depth]);
      if(!menu) return {filled:false,message:"级联下拉选项未加载，请手动确认"};
      const match=await waitFor(()=>{
        const candidates=Array.from(menu.querySelectorAll('.el-cascader-node')).filter(node=>visible(node)&&!disabled(node))
          .map(node=>({node,tail:splitTail(remaining,label(node))})).filter(item=>item.tail!==null);
        return candidates.length===1?candidates[0]:null;
      });
      if(!match) return {filled:false,message:`未找到明确匹配的第 ${depth+1} 级选项，请手动选择`};
      const text=label(match.node);
      const hasChildren=match.node.getAttribute('aria-haspopup')==='true' || Boolean(match.node.querySelector('.el-icon-arrow-right'));
      chosen.push(text);remaining=match.tail;
      click(match.node);
      if(!hasChildren) {
        const expected=chosen.map(compact).join('');
        const ok=await waitFor(()=>compact(control.el.value).replace(/[\s/\\>,，、·-]/g,'')===expected);
        return {filled:Boolean(ok),message:ok?(remaining?`已按网页支持的层级选择：${chosen.join(' / ')}`:''):"级联选中状态未确认，请手动检查"};
      }
      if(!remaining) return {filled:false,message:"地址缺少下一级信息，请手动完成级联选择"};
    }
    return {filled:false,message:"级联层级超过支持范围，请手动选择"};
  }
  async function fill(el,desired) {
    const control=identify(el);
    if(!control || !String(desired??'').trim()) return {filled:false,message:"下拉框或填写值不可用"};
    if(disabled(el)||disabled(control.host)) return {filled:false,message:"下拉框已禁用"};
    if(control.host.querySelector('.el-select__tags,.el-cascader__tags')) return {filled:false,message:"多选下拉请手动选择，避免覆盖已有选择"};
    let popup=null,original=el.value,queried=false,success=false;
    try {
      if(control.type==='autocomplete') {
        const before=new Set(popups(control));
        el.focus();setQuery(el,String(desired));queried=true;
        popup=await waitFor(()=>ownedPopup(control)||popups(control).find(p=>!before.has(p)));
      } else popup=await open(control);
      if(!popup) return {filled:false,message:"下拉菜单未展开或候选项未加载"};
      if(control.type==='cascader') {
        const result=await fillCascade(control,popup,desired);success=result.filled;return result;
      }
      let selected=chooseOption(options(control,popup),desired);
      if(!selected && !el.readOnly && control.type==='select') {
        setQuery(el,String(desired));queried=true;
      }
      if(!selected) selected=await waitFor(()=>chooseOption(options(control,popup),desired));
      if(!selected) return {filled:false,message:"未找到唯一匹配的下拉选项，请手动选择"};
      const expected=label(selected);
      click(selected);
      success=Boolean(await waitFor(()=>compact(el.value)===compact(expected) &&
        (control.type==='autocomplete'? !visible(popup):selected.classList.contains('selected'))));
      return {filled:success,message:success?'已点击并确认下拉选项':"文字已显示，但未确认选中状态，请手动检查"};
    } catch (_) {
      return {filled:false,message:"自定义下拉框操作失败，请手动检查"};
    } finally {
      if(!success && queried) setQuery(el,original);
      close(control,popup);
    }
  }
  root.ResumeCustomSelect=Object.freeze({identify,getLabel,fill,resolveValue,chooseOption,splitTail});
})(typeof globalThis!=="undefined"?globalThis:this);
