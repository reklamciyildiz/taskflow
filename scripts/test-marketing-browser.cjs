// Responsive production-route smoke test in a real browser, without accounts,
// writing data or requiring any private credentials. Run against a local Next dev.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.MARKETING_TEST_URL || 'http://127.0.0.1:3217';
const outputDir = path.join(process.cwd(), 'marketing-browser-artifacts');
const widths = [320,375,390,768,1024,1440];
let assertions=0;
const failures=[];
async function main() {
  const browser=await chromium.launch({headless:true});
  try {
    for (const width of widths) {
      const page=await browser.newPage({
        viewport:{width,height:880},
        deviceScaleFactor:1,
        reducedMotion:width===320?'reduce':'no-preference',
      });
      const pageErrors=[];
      page.on('pageerror',error=>pageErrors.push(error.message));
      try {
        const response=await page.goto(baseUrl+'/marketing',{waitUntil:'domcontentloaded',timeout:90_000});
        assert.equal(response.status(),200,'Expected public marketing 200');
        await page.getByRole('heading',{level:1,name:/Less noise.*More momentum/s}).waitFor({timeout:90_000});
        assert.equal(await page.getByRole('heading',{level:1}).count(),1);
        assertions+=2;

        const scrollSize=await page.evaluate(()=>({
          document:document.documentElement.scrollWidth,
          viewport:window.innerWidth,
          body:document.body.scrollWidth,
        }));
        const overflowNodes=await page.evaluate(()=>{
          const vw=window.innerWidth;
          return Array.from(document.querySelectorAll('body *'))
            .map(el=>({tag:el.tagName.toLowerCase(),cls:String(el.className).slice(0,130),
              text:(el.textContent||'').trim().slice(0,75),
              right:Math.round(el.getBoundingClientRect().right),
              left:Math.round(el.getBoundingClientRect().left),
              width:Math.round(el.getBoundingClientRect().width)}))
            .filter(el=>el.right>vw+2 || el.left<-2)
            .sort((a,b)=>b.right-a.right).slice(0,14);
        });
        assert.ok(scrollSize.document<=scrollSize.viewport+1,
          'Document horizontally overflows at '+width+': '+JSON.stringify({scrollSize,overflowNodes}));
        assertions++;

        for(const text of ['From scattered thoughts','Not another task list','Personal enough for one','Start small']) {
          assert.equal(await page.getByRole('heading',{name:new RegExp(text)}).count(),1,'Missing section '+text);
          assertions++;
        }
        for(const name of ['Preview Planner','Preview Knowledge','Preview Actiproc AI','Preview Boards']) {
          assert.equal(await page.getByRole('button',{name}).count(),1,'Missing interactive tab '+name);
          assertions++;
        }
        await page.getByRole('button',{name:'Preview Planner'}).click();
        await page.getByText('Your week, in focus').waitFor();
        await page.getByRole('button',{name:'Preview Knowledge'}).click();
        await page.getByText('Launch retrospective').first().waitFor();
        await page.getByRole('button',{name:'Preview Actiproc AI'}).click();
        await page.getByText('Workspace-aware assistant').waitFor();
        await page.getByRole('button',{name:'Preview Boards'}).click();
        await page.getByText('Product launch').first().waitFor();
        assertions+=4;

        if(width<1024){
          await page.getByRole('button',{name:'Open navigation menu'}).click();
          assert.equal(await page.getByRole('button',{name:'Close navigation menu'}).getAttribute('aria-expanded'),'true');
          await page.getByRole('navigation',{name:'Mobile navigation'}).getByRole('link',{name:'Product'}).click();
          assert.equal(await page.getByRole('button',{name:'Open navigation menu'}).getAttribute('aria-expanded'),'false');
          assertions+=2;
          await page.getByRole('button',{name:'Open navigation menu'}).click();
          await page.keyboard.press('Escape');
          assert.equal(await page.getByRole('button',{name:'Open navigation menu'}).getAttribute('aria-expanded'),'false');
          assertions++;
        } else {
          assert.equal(await page.getByRole('navigation',{name:'Main navigation'}).isVisible(),true);
          assertions++;
        }

        assert.ok(await page.getByRole('link',{name:'Create account'}).count()>=1);
        for (const plan of ['Free','Individual','Pro','Team']) {
          assert.equal(await page.getByRole('heading',{name:plan,exact:true}).count(),1);
          assertions++;
        }
        const afterInteractions=await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1);
        assert.equal(afterInteractions,true,'Overflow after interaction at '+width);
        assert.deepEqual(pageErrors,[],'Browser runtime errors at '+width);
        assertions+=3;
      } catch(error) {
        fs.mkdirSync(outputDir,{recursive:true});
        await page.screenshot({path:path.join(outputDir,'marketing-failure-'+width+'.png'),fullPage:true}).catch(()=>undefined);
        failures.push({width,error:String(error),pageErrors});
      } finally { await page.close(); }
    }
    assert.deepEqual(failures,[],'Responsive marketing route failures');
    console.log(JSON.stringify({marketingBrowserChecks:assertions,widths,failures,publicRoute:true}));
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1});
