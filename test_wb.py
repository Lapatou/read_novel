import asyncio
import edge_tts

async def t():
    c = edge_tts.Communicate('Hello world!', 'en-US-GuyNeural')
    s = edge_tts.SubMaker()
    async for k in c.stream():
        if k['type'] != 'audio':
            s.feed(k)
    print(s.get_srt())

asyncio.run(t())
