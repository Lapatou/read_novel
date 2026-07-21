const fs = require('fs');

const vttText = `1
00:00:00,050 --> 00:00:01,175
Hello there!

2
00:00:01,175 --> 00:00:03,062
This is a longer paragraph.
`;

let subtitleCues = [];

function parseTime(timeStr) {
    const parts = timeStr.split(':');
    const secParts = parts[2].split(/[,.]/);
    const hours = parseInt(parts[0], 10);
    const mins = parseInt(parts[1], 10);
    const secs = parseInt(secParts[0], 10);
    const ms = parseInt(secParts[1], 10);
    return hours * 3600 + mins * 60 + secs + ms / 1000;
}

function parseVTT(vttText) {
    subtitleCues = [];
    const lines = vttText.split(/\r?\n/);
    let i = 0;
    while(i < lines.length) {
        if(lines[i].includes('-->')) {
            const times = lines[i].split('-->');
            const start = parseTime(times[0].trim());
            const end = parseTime(times[1].trim());
            const text = lines[i+1];
            subtitleCues.push({start, end, text});
            i += 2;
        } else {
            i++;
        }
    }
}

parseVTT(vttText);
console.log(subtitleCues);

const normalize = (str) => {
    if (!str) return "";
    return str.replace(/[^a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF]/g, '').toLowerCase();
};

const paragraphs = ["Hello there!", "This is a longer paragraph."];
let wordElements = [];
paragraphs.forEach(p => {
    const words = p.split(/(\s+)/);
    words.forEach(w => {
        if (w.trim().length > 0) {
            wordElements.push({ textContent: w });
        }
    });
});

console.log("wordElements:", wordElements);

let currentSpanIndex = 0;
for (let cue of subtitleCues) {
    const cueStr = normalize(cue.text);
    if (cueStr.length === 0) continue;
    
    let combinedStr = "";
    let startIndex = currentSpanIndex;
    let endIndex = currentSpanIndex;
    
    for (let j = 0; j < 100; j++) {
        let testIdx = currentSpanIndex + j;
        if (testIdx >= wordElements.length) break;
        
        combinedStr += normalize(wordElements[testIdx].textContent);
        endIndex = testIdx;
        
        if (combinedStr === cueStr || combinedStr.length >= cueStr.length) {
            break;
        }
    }
    
    cue.startSpanIndex = startIndex;
    cue.endSpanIndex = endIndex;
    currentSpanIndex = endIndex + 1;
}

console.log(subtitleCues);
