# WebBuster 
# Advanced API and Swagger Documentation Scanner

WebBuster (v2) is a powerful Node.js tool designed to discover API endpoints, Swagger/OpenAPI documentation, and configuration files in web applications. This tool helps security researchers and developers identify exposed API endpoints, documentation, and potential configuration files, making it valuable for API security assessments and documentation discovery.

## Features

- Automatically discovers API endpoints and patterns
- Detects Swagger/OpenAPI documentation files
- Identifies common configuration files (package.json, .env, appsettings.json, etc.)
- Supports both static and dynamic (JavaScript-rendered) content scanning
- Aggressive fuzzing mode for thorough documentation discovery
- Colored terminal output for better readability
- Concurrent scanning with configurable concurrency (default: 8)
- Polite scanning with built-in delays
- Customizable output formats
- Support for custom path lists
- Built-in timeout and rate limiting protections
- Extended Swagger/OpenAPI path detection

## Prerequisites

- Node.js 18+ recommended (for built-in fetch support)
- For dynamic JS execution: Puppeteer (`npm install puppeteer`)
- For Node.js versions < 18: Install `node-fetch` manually

## Installation

1. Clone the repository
2. Install dependencies (if using Puppeteer):
   ```bash
   npm install puppeteer
   ```

## Usage

Basic usage:
```bash
node webuster.js <target-url> [--out=results.json] [--paths=my_paths.txt] [--puppeteer] [--fuzz]
```

### Options

- `--out=<filename>` - Specify output file (default: results.json). An HTML report will also be generated with the same name but .html extension
- `--paths=<filename>` - Use custom paths list file
- `--puppeteer` - Enable dynamic JavaScript execution using Puppeteer
- `--fuzz` - Enable aggressive fuzzing mode for thorough documentation discovery

### Examples

Scan a website and save results to default location (generates both results.json and results.html):
```bash
node webuster.js https://example.com
```

Scan with custom output file (will generate both apis.json and apis.html):
```bash
node webuster.js https://example.com --out=apis.json
```

Scan with Puppeteer enabled:
```bash
node webuster.js https://example.com --puppeteer
```

Note: For every scan, the tool automatically generates two files:
- A JSON file with the specified name (default: results.json)
- An HTML report with the same name but .html extension (default: results.html)

## Output Formats

The tool generates two output files:

### JSON Output
A detailed JSON file containing:
- Target URL information
- Discovered API endpoints
- Found Swagger/OpenAPI documentation
- Response status and content type information

### HTML Report
An HTML report with color-coded findings:
- Swagger/OpenAPI documentation (Blue)
- Alternative documentation (Green)
- Configuration files (Orange)
- API endpoints (Red)

The HTML report provides a more visually appealing and easier-to-read format of the scan results.

Example output structure:
```json
{
  "target": "https://example.com",
  "discovered": {
    "apiPaths": [
      {
        "path": "/api/v1/endpoint",
        "url": "https://example.com/api/v1/endpoint",
        "check": {
          "status": 200,
          "ct": "application/json"
        }
      }
    ]
  }
}
```

## Configuration

The tool includes several configurable parameters in the source code:
- `DEFAULT_TIMEOUT`: Timeout per fetch request (default: 10000ms)
- `CONCURRENCY`: Number of concurrent requests (default: 8)
- `USER_AGENT`: Custom user agent string
- `POLITE_DELAY_MS`: Delay between requests (default: 15ms)
- Color configurations:
  - Terminal output colors (ANSI)
  - HTML/browser output colors (CSS)
- Extensive lists:
  - Common Swagger/OpenAPI paths
  - Aggressive fuzzing wordlist
  - Configuration file paths
  - API path patterns for detection

## Ethical Usage

⚠️ **Important**: This tool should only be used on systems you own or have explicit permission to test. Unauthorized scanning may be illegal and unethical.

## Technical Details

The scanner implements various detection methods:
- Direct path probing for common API endpoints
- Configuration file discovery (package.json, .env, etc.)
- Regular expression pattern matching for API-like URLs
- Swagger/OpenAPI documentation detection
- Content-type analysis
- Status code verification
- Colored terminal output for better visualization:
  - Bright: Target information
  - Cyan: Progress updates
  - Green: Success messages
  - Red: Error messages
  - Yellow: Warnings
  - Magenta: Discovery results

## Contributing

Contributions are welcome! Please feel free to submit pull requests with improvements, additional features, or bug fixes.


## Disclaimer

This tool is provided for legitimate security research and development purposes only. Users are responsible for ensuring they have appropriate authorization before scanning any systems.
