const flags=[
  'AI_ATOMIC_QUOTA_ENABLED','AI_INDEXING_ENABLED',
  'AI_INDEX_BACKFILL_ENABLED','AXIOM_AI_CHAT_ENABLED',
];
const required=[
  'GROQ_API_KEY','GROQ_CHAT_MODEL','CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_AI_API_TOKEN','CLOUDFLARE_EMBEDDING_MODEL','CRON_SECRET',
];
const result={
  flags:Object.fromEntries(flags.map((name)=>[name,{
    configured:Boolean(process.env[name]),
    safeFalse:process.env[name]?.trim().toLowerCase()==='false',
  }])),
  providers:Object.fromEntries(required.map((name)=>[name,Boolean(process.env[name]?.trim())])),
  beta:{
    modeConfigured:Boolean(process.env.AXIOM_AI_BETA_MODE_ENABLED?.trim()),
    userAllowlistConfigured:Boolean(process.env.AXIOM_AI_BETA_USER_IDS?.trim()),
    organizationAllowlistConfigured:Boolean(process.env.AXIOM_AI_BETA_ORGANIZATION_IDS?.trim()),
  },
};
console.log(JSON.stringify(result,null,2));
if (Object.values(result.flags).some((entry)=>!entry.safeFalse)) process.exitCode=2;
if (Object.values(result.providers).some((configured)=>!configured)) process.exitCode=3;
