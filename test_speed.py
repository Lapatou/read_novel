import time
import asyncio
import edge_tts

async def t():
    t0 = time.time()
    c = edge_tts.Communicate('hello ' * 1000, 'en-US-AvaMultilingualNeural')
    await c.save('test.mp3')
    print(f"Time: {time.time()-t0}")

asyncio.run(t())
