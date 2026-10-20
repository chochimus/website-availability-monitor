import { readFile, appendFile } from 'node:fs/promises';

function getTimeStamp() {
  return new Date().toTimeString().split(' ')[0];
}

async function endpointResult(url, signal) {
  const timeStamp = getTimeStamp();
  try {
    const start = performance.now();
    let response = await fetch(url, { signal });
    let outcome;
    if (!response.ok) {
      outcome = 'DOWN';
    } else {
      outcome = 'UP'
    }
    const end = performance.now();

    return {
      timeStamp,
      url,
      outcome,
      status: response.status,
      responseTime: (end - start).toFixed(2),
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      throw error;
    }
    return {
      timeStamp,
      url,
      outcome: 'ERROR',
    }
  }
}

function logValidEntry(entry) {
    if (entry.outcome !== 'ERROR') {
    console.log(`[${entry.timeStamp}] ${entry.outcome} ${entry.url} (${entry.status}, ${entry.responseTime}ms)`);
  } else {
    console.log(`[${entry.timeStamp}] ${entry.outcome} ${entry.url}`);
  }
}

async function appendEntry(entry) {
  let outputFile = './logs.jsonl';
  try {
    await appendFile(outputFile, entry, 'utf8');
  } catch (error) {
    console.error('Error writing JSONL:', error);
  }
}

async function processResults(results) {
  for (const result of results) {
    if (result.status === 'fulfilled') {
      let entry = result.value;
      logValidEntry(entry); 
      await appendEntry(JSON.stringify(entry) + '\n');
    } else if (result.reason.name !== 'AbortError')  {
      console.log(`ERROR OCCURED: ${result.reason.message}`);
    }
  };
}

async function runChecks(url, signal) {    
  try {
    let results = await Promise.allSettled(url.map((address) => endpointResult(address, signal)));
    await processResults(results);
  } catch(error) {
    console.error(`Error: ${error.message}`)
  }
}

async function main() {
  let timer;
  let shuttingDown = false;
  try {
    let file = await readFile('./monitor.config.json', 'utf8');
    let {intervalSeconds, url} = (JSON.parse(file));
    
    const ac = new AbortController();
    const { signal } = ac;

    process.on('SIGINT', () => {
      console.log('\nReceived SIGINT. Cancelling operations...');
      if (timer) clearTimeout(timer);
      ac.abort();
      shuttingDown = true;
    });

    let scheduleChecks = async (url, signal, delay) => {
      if (shuttingDown) return;
      await runChecks(url, signal);
      if (shuttingDown) return;
      timer = setTimeout(() => scheduleChecks(url, signal, delay), delay);
    }

    scheduleChecks(url, signal, intervalSeconds * 1000);
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('Fetch operation cancelled.');
    } else {
      console.error(error.message);
    }
  }
}

main();