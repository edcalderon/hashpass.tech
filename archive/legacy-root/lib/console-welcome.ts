/**
 * Console Welcome Message
 * Displays ASCII art and welcome message when console is opened
 */

const ASCII_ART = `
██╗  ██╗ █████╗ ███████╗██╗  ██╗██████╗  █████╗ ███████╗███████╗
██║  ██║██╔══██╗██╔════╝██║  ██║██╔══██╗██╔══██╗██╔════╝██╔════╝
███████║███████║███████╗███████║██████╔╝███████║███████╗███████╗
██╔══██║██╔══██║╚════██║██╔══██║██╔═══╝ ██╔══██║╚════██║╚════██║
██║  ██║██║  ██║███████║██║  ██║██║     ██║  ██║███████║███████║
╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝  ╚═╝╚══════╝╚══════╝
                                                                
███████╗██╗    ██╗ █████╗ ██╗     ██╗     ███████╗████████╗
██╔════╝██║    ██║██╔══██╗██║     ██║     ██╔════╝╚══██╔══╝
█████╗  ██║ █╗ ██║███████║██║     ██║     ███████╗   ██║   
██╔══╝  ██║███╗██║██╔══██║██║     ██║     ╚════██║   ██║   
██║     ╚██╔╝╚████║██║  ██║███████╗███████╗███████║   ██║   
╚═╝      ╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝╚══════╝╚══════╝   ╚═╝   
`;

const WELCOME_MESSAGE = `
Welcome to HashPass 🚀

Interested in joining the team? -> edward@hashpass.tech
Found a bug? Report it at https://hashpass.tech/support
`;

export function showConsoleWelcome() {
  if (typeof window === 'undefined') return;
  
  let consoleOpened = false;
  
  const showWelcome = () => {
    if (consoleOpened) return;
    consoleOpened = true;
    
    // Use setTimeout to ensure console is ready
    setTimeout(() => {
      console.log('%c' + ASCII_ART, 'color: #4ECDC4; font-family: monospace; font-size: 8px; line-height: 1;');
      console.log('%c' + WELCOME_MESSAGE, 'color: #FF6B6B; font-size: 14px; font-weight: bold;');
      console.log('%cStop! Create the support view', 'color: #FFD93D; font-size: 16px; font-weight: bold;');
    }, 100);
  };
  
  // Override console methods to detect when console is opened
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalInfo = console.info;
  const originalDebug = console.debug;
  
  // Override console methods
  console.log = function(...args: any[]) {
    showWelcome();
    return originalLog.apply(console, args);
  };
  
  console.error = function(...args: any[]) {
    showWelcome();
    return originalError.apply(console, args);
  };
  
  console.warn = function(...args: any[]) {
    showWelcome();
    return originalWarn.apply(console, args);
  };
  
  console.info = function(...args: any[]) {
    showWelcome();
    return originalInfo.apply(console, args);
  };
  
  console.debug = function(...args: any[]) {
    showWelcome();
    return originalDebug.apply(console, args);
  };
  
  // Detect DevTools via timing detection (more reliable)
  let devtools = { open: false };
  const threshold = 160;
  
  const detectDevTools = setInterval(() => {
    const start = performance.now();
    (function() {
      // eslint-disable-next-line no-debugger
      debugger;
    })();
    const end = performance.now();
    
    if (end - start > threshold) {
      if (!devtools.open) {
        devtools.open = true;
        showWelcome();
      }
    } else {
      devtools.open = false;
    }
  }, 1000);
  
  // Cleanup on page unload
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      clearInterval(detectDevTools);
    });
  }
}

