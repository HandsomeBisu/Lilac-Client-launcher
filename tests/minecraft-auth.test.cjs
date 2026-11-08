const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyMinecraft, serviceError } = require('../electron/auth/minecraft.cjs');
function network({owns=true, profileStatus=200, loginStatus=200, skinUrl}={}) {
  const calls=[];
  return { calls, fetcher: async(url,options)=>{
    calls.push({url,options});
    const pathname=new URL(url).pathname;
    let data, status=200;
    if(pathname==='/user/authenticate')data={Token:'xbox-token',DisplayClaims:{xui:[{uhs:'hash'}]}};
    else if(pathname==='/xsts/authorize')data={Token:'xsts-token',DisplayClaims:{xui:[{uhs:'hash'}]}};
    else if(pathname==='/launcher/login'){data={access_token:'game-token',expires_in:3600};status=loginStatus;}
    else if(pathname==='/entitlements/license')data={items:owns?[{name:'game_minecraft'}]:[]};
    else if(pathname==='/minecraft/profile'){data={id:'b'.repeat(32),name:'LilacTest',skins:skinUrl?[{state:'ACTIVE',url:skinUrl}]:[]};status=profileStatus;}
    else throw new Error('Unexpected host/path');
    return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
  }};
}
test('game identity pipeline verifies ownership and profile; skin URLs cannot target arbitrary hosts',async()=>{
  const net=network({skinUrl:'https://attacker.invalid/private'});
  const result=await verifyMinecraft('ms-token',net);
  assert.equal(result.profile.name,'LilacTest');assert.equal(result.accessToken,'game-token');assert.equal(result.profile.skinDataUrl,null);
  assert.equal(net.calls.length,5);
  assert.equal(JSON.parse(net.calls[0].options.body).Properties.RpsTicket,'d=ms-token');
  assert.equal(JSON.parse(net.calls[2].options.body).xtoken,'XBL3.0 x=hash;xsts-token');
  assert.equal(net.calls[4].options.headers.Authorization,'Bearer game-token');
});
test('accounts without ownership or a Java profile never receive a usable game session',async()=>{
  const noOwnership=network({owns:false});
  await assert.rejects(verifyMinecraft('ms-token',noOwnership),{code:'minecraft_not_owned'});
  assert.equal(noOwnership.calls.length,4);
  await assert.rejects(verifyMinecraft('ms-token',network({profileStatus:404})),{code:'minecraft_profile_required'});
});
test('app approval failure and Xbox account requirements are actionable',async()=>{
  await assert.rejects(verifyMinecraft('ms-token',network({loginStatus:403})),{code:'minecraft_app_access'});
  assert.equal(serviceError('xsts',401,{XErr:2148916238}).code,'xbox_family_required');
  assert.equal(serviceError('xsts',401,{XErr:2148916236}).code,'xbox_age_verification');
  assert.equal(serviceError('xsts',401,{XErr:2148916233}).code,'xbox_profile_required');
});
