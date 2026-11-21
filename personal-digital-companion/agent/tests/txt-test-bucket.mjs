export function bucketFixture(){
  const objects=new Map();
  return {objects, async put(key,body){objects.set(key,new Uint8Array(await new Response(body).arrayBuffer()));},
    async head(key){return objects.has(key)?{size:objects.get(key).length}:null;},
    async get(key){return objects.has(key)?{body:objects.get(key)}:null;},async delete(key){objects.delete(key);}};
}
