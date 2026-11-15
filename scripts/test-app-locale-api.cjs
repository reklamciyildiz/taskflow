const assert=require('node:assert/strict');
const esbuild=require('esbuild');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {NextRequest,NextResponse}=require('next/server');

async function main(){
  const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'actiproc-locale-')),'settings.cjs');
  const records=new Map();
  let actor={id:'user-A'};
  const db={from(table){
    assert.equal(table,'user_settings');
    let filter=null,change=null;
    const query={
      select(){return query;},
      eq(column,value){assert.equal(column,'user_id');filter=value;return query;},
      single:async()=>({data:records.get(filter)||null,error:records.has(filter)?null:{code:'PGRST116'}}),
      upsert(value){change=value;return query;},
    };
    // PATCH writes use upsert().select().single() without eq.
    query.single=async()=>{
      if(change){
        const row={...(records.get(change.user_id)||{}),...change};
        records.set(change.user_id,row);return {data:row,error:null};
      }
      return {data:records.get(filter)||null,error:records.has(filter)?null:{code:'PGRST116'}};
    };
    return query;
  }};
  globalThis.__localeTest={
    db,NextResponse,auth:()=>({user:actor}),
  };
  await esbuild.build({entryPoints:['app/api/users/settings/route.ts'],outfile:file,bundle:true,platform:'node',
    plugins:[{name:'stubs',setup(build){
      build.onResolve({filter:/^next\/server$|^@\/lib\/(server-authz|supabase-admin)$/},
        args=>({path:args.path,namespace:'locale-stub'}));
      build.onLoad({filter:/.*/,namespace:'locale-stub'},args=>({contents:
        args.path==='next/server'
          ? 'export const NextResponse=globalThis.__localeTest.NextResponse;'
          : args.path.endsWith('server-authz')
            ? 'export const requireAuthedUser=async()=>globalThis.__localeTest.auth();'
            : 'export const supabaseAdmin=globalThis.__localeTest.db;'
      }));
    }}]});
  const route=require(file);
  const make=(body)=>new NextRequest('http://localhost/api/users/settings',{
    method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),
  });
  const invalid=await route.PATCH(make({locale:'de'}));
  assert.equal(invalid.status,400);
  const bad=await route.PATCH(make({locale:'tr',unknownField:true}));
  assert.equal(bad.status,400);
  assert.equal(records.size,0);
  let good=await route.PATCH(make({locale:'tr'}));
  assert.equal(good.status,200);
  assert.equal((await good.json()).data.locale,'tr');
  let read=await route.GET(new NextRequest('http://localhost/api/users/settings'));
  assert.equal((await read.json()).data.locale,'tr');
  actor={id:'user-B'};
  let other=await route.GET(new NextRequest('http://localhost/api/users/settings'));
  assert.equal((await other.json()).data.locale,'en');
  assert.equal(records.get('user-A').locale,'tr');
  const switched=await route.PATCH(make({locale:'en'}));
  assert.equal((await switched.json()).data.locale,'en');
  console.log('Settings API locale isolation, validation, and persistence passed');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
