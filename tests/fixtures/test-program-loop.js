// Test program that runs in a loop for DAP debugging tests
let counter = 0;
let running = true;

function main() {
  console.log('Starting test program with loop');
  
  // Line 10 - First breakpoint location
  while (running && counter < 100) {
    counter++;
    
    // Line 15 - Second breakpoint location  
    if (counter % 10 === 0) {
      console.log(`Counter: ${counter}`);
    }
    
    // Line 20 - Third breakpoint location
    processData(counter);
    
    // Add a small delay to prevent CPU spinning
    const start = Date.now();
    while (Date.now() - start < 100) {
      // busy wait
    }
  }
  
  // Line 30 - Final breakpoint location
  console.log('Test program loop completed');
}

function processData(value) {
  return value * 2;
}

// Handle termination signal
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  running = false;
});

// Run the program
main();