import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import {
  normalizedLoginEmail,
  validatePasswordLogin,
  PasswordLoginBackendError,
  PASSWORD_LOGIN_UNAVAILABLE_CODE,
  passwordLoginErrorMessage,
  safeAuthCallbackPath,
} from '../lib/password-login';

async function run() {
const hash = await bcrypt.hash('ValidPass-2026!', 4);
const stored = {id:'u-1',email:'user@example.com',name:'Test User',avatar_url:null,password_hash:hash};

assert.equal(normalizedLoginEmail('  USER@EXAMPLE.COM  '),'user@example.com');
assert.equal(normalizedLoginEmail(undefined),'');
assert.equal(normalizedLoginEmail({}),'');
assert.equal(passwordLoginErrorMessage('CredentialsSignin').includes('Google'),true);
assert.match(passwordLoginErrorMessage(PASSWORD_LOGIN_UNAVAILABLE_CODE),/temporarily unavailable/);
assert.doesNotMatch(passwordLoginErrorMessage('Unexpected: database credentials x'),/database credentials/);
assert.equal(safeAuthCallbackPath('/dashboard?tab=today'),'/dashboard?tab=today');
assert.equal(safeAuthCallbackPath('/invite/team?token=abc#join'),'/invite/team?token=abc#join');
for(const unsafe of ['https://evil.example','//evil.example','/\\evil.example','javascript:alert(1)','/dash\nboard',null]){
  assert.equal(safeAuthCallbackPath(unsafe),'/',String(unsafe));
}

let queriedEmails: string[] = [];
const deps = {
  async findUserByEmail(email:string){
    queriedEmails.push(email);
    return email === stored.email ? stored : null;
  },
  async verifyPassword(plain:string,saved:string){return bcrypt.compare(plain,saved);},
};
const good = await validatePasswordLogin({email:'  USER@EXAMPLE.COM ',password:'ValidPass-2026!'},deps);
assert.deepEqual(good,{id:'u-1',email:'user@example.com',name:'Test User',image:null});
assert.deepEqual(queriedEmails,['user@example.com']);
assert.equal(await validatePasswordLogin({email:'user@example.com',password:'wrong'},deps),null);
assert.equal(await validatePasswordLogin({email:'absent@example.com',password:'anything'},deps),null);
assert.equal(await validatePasswordLogin({email:'user@example.com',password:''},deps),null);
assert.equal(await validatePasswordLogin({email:'',password:'secret'},deps),null);
assert.equal(await validatePasswordLogin(null,deps),null);

const googleOnly = {...stored,password_hash:null};
assert.equal(await validatePasswordLogin({email:stored.email,password:'anything'},{
  findUserByEmail:async()=>googleOnly,
  verifyPassword:async()=>{throw new Error('should not compare');},
}),null);

for(let i=0;i<2;i++){
  const secondDevice = await validatePasswordLogin({email:stored.email,password:'ValidPass-2026!'},deps);
  assert.equal(secondDevice?.id,stored.id,'Repeated valid sign-in must not invalidate another device');
}

for(const [operation,broken] of [
  ['lookup',{findUserByEmail:async()=>{throw new Error('DB connection lost');},verifyPassword:deps.verifyPassword}],
  ['verify',{findUserByEmail:async()=>stored,verifyPassword:async()=>{throw new Error('bcrypt unexpected');}}],
] as const){
  await assert.rejects(
    validatePasswordLogin({email:stored.email,password:'ValidPass-2026!'},broken),
    (error:unknown)=>error instanceof PasswordLoginBackendError&&error.operation===operation,
    operation+' failures must not be treated as invalid credentials',
  );
}

const authAdapter = readFileSync('lib/auth.ts','utf8');
const signInForm = readFileSync('app/auth/signin/SignInClient.tsx','utf8');
assert.match(authAdapter, /return await validatePasswordLogin/);
assert.match(authAdapter, /throw new Error\(PASSWORD_LOGIN_UNAVAILABLE_CODE\)/);
assert.doesNotMatch(authAdapter, /console\.error\('Auth error:', error\)/);
assert.match(signInForm, /setClientError\(passwordLoginErrorMessage\(result\?\.error\)\)/);
assert.match(signInForm, /role="alert"/);
assert.match(signInForm, /router\.replace\(safeCallbackUrl\)/);
assert.doesNotMatch(signInForm, /console\.error\('Sign in error:'/);
console.log('Password login: normalization, valid/invalid, Google-only, transient failures, multiple sign-ins, safe redirect, UI adapter and messaging PASS');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
