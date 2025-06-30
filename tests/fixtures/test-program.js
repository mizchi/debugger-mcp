// Test program for DAP debugging tests
function main() {
  console.log('Starting test program');
  
  let counter = 0;
  
  // Line 10 - Breakpoint location
  for (let i = 0; i < 5; i++) {
    counter += i;
    console.log(`Iteration ${i}: counter = ${counter}`);
  }
  
  // Line 20 - Breakpoint location
  const result = processData(counter);
  console.log(`Result: ${result}`);
  
  // Line 30 - Breakpoint location
  console.log('Test program completed');
}

function processData(value) {
  return value * 2;
}

// Run the program
main();