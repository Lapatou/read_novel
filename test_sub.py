import asyncio
import edge_tts

async def t():
    c = edge_tts.Communicate("Hello there! This is a longer paragraph. It has multiple sentences to see how edge-tts handles it. Does it put them on one line?", "en-US-AvaMultilingualNeural")
    s = edge_tts.SubMaker()
    async for k in c.stream():
        if k['type'] != 'audio':
            s.feed(k)
    print("SRT OUTPUT:")
    print(s.get_srt())

asyncio.run(t())
