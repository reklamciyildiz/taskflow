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
        await page.getByRole('heading',{level:1,name:/Everything.*moves.*together/s}).waitFor({timeout:90_000});
        // SSR markup is visible before React attaches client events. Verify
        // the hydrated experience, not a pre-hydration click that gets lost.
        await page.waitForLoadState('load');
        await page.waitForLoadState('networkidle',{timeout:15_000}).catch(()=>undefined);
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

        for(const text of ['An idea should never become','Not another task list','From one brilliant mind','Start small']) {
          assert.equal(await page.getByRole('heading',{name:new RegExp(text)}).count(),1,'Missing section '+text);
          assertions++;
        }
        for(const name of ['Preview Planner','Preview Knowledge','Preview Actiproc AI','Preview Boards','Preview Insights','Preview Team & customers']) {
          assert.equal(await page.getByRole('button',{name}).count(),1,'Missing interactive tab '+name);
          assertions++;
        }
        await page.getByRole('button',{name:'Preview Planner'}).click();
        await page.getByText('QUICK CAPTURE').waitFor();
        await page.getByRole('tab',{name:'Calendar'}).click();
        await page.getByText('Your week, in focus').waitFor();
        await page.getByRole('tab',{name:'Today'}).click();
        await page.getByRole('button',{name:'Add sample checklist item'}).isDisabled().then(value=>assert.equal(value,true));
        await page.getByRole('textbox',{name:'Sample quick capture'}).fill('Review demo sprint goals');
        await page.getByRole('button',{name:'Add sample checklist item'}).click();
        await page.getByText('Review demo sprint goals').waitFor();
        await page.getByRole('button',{name:'Preview Knowledge'}).click();
        await page.getByText('Launch retrospective').first().waitFor();
        await page.getByRole('button',{name:'Pin Launch retrospective'}).click();
        await page.getByRole('tab',{name:'Pinned'}).click();
        await page.getByText('Launch retrospective').first().waitFor();
        await page.getByRole('button',{name:'Preview Actiproc AI'}).click();
        await page.getByText('Actiproc AI · Workspace assistant').waitFor();
        await page.getByRole('button',{name:'Preview Boards'}).click();
        await page.getByText('Product launch').first().waitFor();
        await page.getByRole('button',{name:'Add sample Action'}).click();
        await page.getByText('Plan the next product sprint').waitFor();
        await page.getByRole('button',{name:'Mark done'}).click();
        await page.getByText('Demo completed').waitFor();
        await page.getByRole('button',{name:'Reset demo'}).click();
        await page.getByRole('button',{name:'Mark done'}).waitFor();
        await page.getByRole('button',{name:'Preview Insights'}).click();
        await page.getByText('Workspace insights').waitFor();
        await page.getByRole('button',{name:'Preview Team & customers'}).click();
        await page.getByText('Shared product launch').waitFor();
        assertions+=8;

        for (const mode of ['For my team','For an organization','For myself']) {
          await page.getByRole('tab',{name:mode}).click();
          assert.equal(await page.getByRole('tab',{name:mode}).getAttribute('aria-selected'),'true');
          assertions++;
        }
        await page.getByText('A clearer day starts here.').waitFor();
        await page.getByText('Good questions.').waitFor();
        assertions+=2;

        if(width<1024){
          await page.getByRole('button',{name:'Open navigation menu'}).click();
          assert.equal(await page.getByRole('button',{name:'Close navigation menu'}).getAttribute('aria-expanded'),'true');
          await page.getByRole('navigation',{name:'Mobile navigation'}).getByRole('link',{name:'Everything inside'}).click();
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
        // These amounts are public list prices, not estimates. A click must
        // update both paid plans without changing the fixed Individual annual plan.
        await page.getByRole('button',{name:'Yearly · save 16.7%'}).click();
        const proCard=page.getByRole('article').filter({has:page.getByRole('heading',{name:'Pro',exact:true})});
        const teamCard=page.getByRole('article').filter({has:page.getByRole('heading',{name:'Team',exact:true})});
        await proCard.getByText('$40',{exact:true}).waitFor();
        await teamCard.getByText('$60',{exact:true}).waitFor();
        await page.getByRole('button',{name:'Monthly',exact:true}).click();
        await proCard.getByText('$4',{exact:true}).waitFor();
        await teamCard.getByText('$6',{exact:true}).waitFor();
        assertions+=4;
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
