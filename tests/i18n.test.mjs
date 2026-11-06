import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
const {window}=parseHTML('<html><head></head><body><button id="languageToggle"><span id="currentLang">AR</span></button></body></html>');
Object.assign(globalThis,{window,document:window.document,Node:window.Node,NodeFilter:{SHOW_ELEMENT:1,SHOW_TEXT:4},MutationObserver:window.MutationObserver,CustomEvent:window.CustomEvent,location:{hostname:'aiasbsr.com',protocol:'https:'}});
const values=new Map();globalThis.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
document.cookie='aias_language=en';
const {setLanguage,translate,t}=await import('../js/i18n.js');
test('Arabic translates visible controls and placeholders, retains option values, and restores English',()=>{
 document.body.innerHTML='<button id="languageToggle"><span id="currentLang">AR</span></button><h1>Professional accounts</h1><input placeholder="Search by name, username, or email" value="A person"><select><option>Published</option></select><p>22 of 22 accounts</p>';
 setLanguage('ar');
 assert.equal(document.documentElement.lang,'ar');assert.equal(document.documentElement.dir,'rtl');
 assert.equal(document.querySelector('h1').textContent,'حسابات المحترفين');assert.equal(document.querySelector('input').placeholder,'ابحث بالاسم أو اسم المستخدم أو البريد الإلكتروني');assert.equal(document.querySelector('input').value,'A person');assert.equal(document.querySelector('option').getAttribute('value'),'Published');assert.equal(document.querySelector('p').textContent,'22 من 22 حساب');
 assert.match(document.cookie,/Domain=aiasbsr.com/);
 setLanguage('en');assert.equal(document.querySelector('h1').textContent,'Professional accounts');assert.equal(document.querySelector('option').textContent,'Published');assert.equal(document.documentElement.dir,'ltr');
});
test('late-rendered menus translate without touching user content or record previews',()=>{
 document.body.innerHTML='<div><button aria-label="Account actions">Verify account</button><pre class="library-json">Verify account</pre><h3 data-user-content>Home</h3><span data-en="Market" data-ar="السوق">Market</span></div>';
 setLanguage('ar');assert.equal(document.querySelector('button').textContent,'توثيق الحساب');assert.equal(document.querySelector('button').getAttribute('aria-label'),'إجراءات الحساب');assert.equal(document.querySelector('pre').textContent,'Verify account');assert.equal(document.querySelector('h3').textContent,'Home');assert.equal(document.querySelector('span').textContent,'السوق');
 const button=document.createElement('button');button.textContent='Enable business';document.body.append(button);translate(button);assert.equal(button.textContent,'تفعيل حساب الأعمال');
 setLanguage('en');assert.equal(button.textContent,'Enable business');assert.equal(t('Page 2 of 3','ar'),'الصفحة 2 من 3');
});
