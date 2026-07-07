const ASCII_ART = `
██╗  ██╗ █████╗ ███████╗██╗  ██╗██████╗  █████╗ ███████╗███████╗
██║  ██║██╔══██╗██╔════╝██║  ██║██╔══██╗██╔══██╗██╔════╝██╔════╝
███████║███████║███████╗███████║██████╔╝███████║███████╗███████╗
██╔══██║██╔══██║╚════██║██╔══██║██╔═══╝ ██╔══██║╚════██║╚════██║
██║  ██║██║  ██║███████║██║  ██║██║     ██║  ██║███████║███████║
╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝  ╚═╝╚══════╝╚══════╝
`;

const WELCOME_MESSAGE = `
Welcome to HASHPASS 🚀

Interested in joining the team? -> edward@hashpass.tech
Found a bug? Report it at https://hashpass.tech/support
`;

export function showConsoleWelcome() {
  if (typeof window === 'undefined') return;

  setTimeout(() => {
    console.log('%c' + ASCII_ART, 'color: #4ECDC4; font-family: monospace; font-size: 8px; line-height: 1;');
    console.log('%c' + WELCOME_MESSAGE, 'color: #FF6B6B; font-size: 14px; font-weight: bold;');
  }, 100);
}
