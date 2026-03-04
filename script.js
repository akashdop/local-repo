/**
 * Scientific Calculator
 * Supports: basic arithmetic, trigonometry, logarithms, exponents,
 * factorial, parentheses, memory, and keyboard input.
 */

(function () {
    'use strict';

    // ===== State =====
    const state = {
        expression: '',       // The raw expression string being built
        displayValue: '0',    // What's shown on the main display
        history: '',          // The history/previous expression
        mode: 'DEG',          // DEG or RAD
        memory: 0,            // Memory value
        hasMemory: false,     // Whether memory has been used
        justEvaluated: false, // Whether the last action was '='
        error: false,
    };

    // ===== DOM Elements =====
    const displayCurrent = document.getElementById('display-current');
    const displayHistory = document.getElementById('display-history');
    const displayEl = document.getElementById('display');
    const indicatorMode = document.getElementById('indicator-mode');
    const indicatorMemory = document.getElementById('indicator-memory');
    const degBtn = document.getElementById('deg-btn');
    const radBtn = document.getElementById('rad-btn');

    // ===== Helpers =====
    function factorial(n) {
        if (n < 0) return NaN;
        if (n === 0 || n === 1) return 1;
        if (n > 170) return Infinity;
        if (!Number.isInteger(n)) {
            // Gamma approximation for non-integers (Stirling)
            return gamma(n + 1);
        }
        let result = 1;
        for (let i = 2; i <= n; i++) result *= i;
        return result;
    }

    // Simple Lanczos gamma approximation
    function gamma(z) {
        if (z < 0.5) {
            return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
        }
        z -= 1;
        const g = 7;
        const c = [
            0.99999999999980993, 676.5203681218851, -1259.1392167224028,
            771.32342877765313, -176.61502916214059, 12.507343278686905,
            -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
        ];
        let x = c[0];
        for (let i = 1; i < g + 2; i++) {
            x += c[i] / (z + i);
        }
        const t = z + g + 0.5;
        return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
    }

    function toRadians(deg) {
        return (deg * Math.PI) / 180;
    }

    function isOperator(ch) {
        return ['+', '−', '×', '÷', '^'].includes(ch);
    }

    function lastChar(str) {
        return str.length > 0 ? str[str.length - 1] : '';
    }

    // ===== Expression Evaluation =====
    function evaluateExpression(expr) {
        // Replace display symbols with JS-compatible equivalents
        let e = expr;

        // Replace constants
        e = e.replace(/π/g, `(${Math.PI})`);
        e = e.replace(/e(?![a-z])/g, `(${Math.E})`);

        // Replace operators
        e = e.replace(/×/g, '*');
        e = e.replace(/÷/g, '/');
        e = e.replace(/−/g, '-');

        // Handle percentage: number% -> (number/100)
        e = e.replace(/(\d+\.?\d*)%/g, '($1/100)');

        // Handle implicit multiplication: 2(3), (2)(3), 2sin, etc.
        e = e.replace(/(\d)\(/g, '$1*(');
        e = e.replace(/\)(\d)/g, ')*$1');
        e = e.replace(/\)\(/g, ')*(');

        // Handle scientific functions
        const mode = state.mode;

        // Replace trig functions with proper radian conversion
        e = e.replace(/sin\(([^)]+)\)/g, (_, arg) => {
            if (mode === 'DEG') return `Math.sin((${arg})*Math.PI/180)`;
            return `Math.sin(${arg})`;
        });
        e = e.replace(/cos\(([^)]+)\)/g, (_, arg) => {
            if (mode === 'DEG') return `Math.cos((${arg})*Math.PI/180)`;
            return `Math.cos(${arg})`;
        });
        e = e.replace(/tan\(([^)]+)\)/g, (_, arg) => {
            if (mode === 'DEG') return `Math.tan((${arg})*Math.PI/180)`;
            return `Math.tan(${arg})`;
        });
        e = e.replace(/ln\(([^)]+)\)/g, 'Math.log($1)');
        e = e.replace(/log\(([^)]+)\)/g, 'Math.log10($1)');
        e = e.replace(/√\(([^)]+)\)/g, 'Math.sqrt($1)');
        e = e.replace(/abs\(([^)]+)\)/g, 'Math.abs($1)');

        // Handle factorial: number!
        e = e.replace(/(\d+\.?\d*)!/g, 'factorial($1)');

        // Handle power
        e = e.replace(/\^/g, '**');

        // Evaluate safely
        try {
            // Create a safe evaluation context
            const safeEval = new Function('factorial', 'gamma', `"use strict"; return (${e});`);
            const result = safeEval(factorial, gamma);

            if (typeof result !== 'number' || isNaN(result)) {
                return { error: true, message: 'Error' };
            }
            if (!isFinite(result)) {
                return { error: false, value: result > 0 ? 'Infinity' : '-Infinity' };
            }

            // Format result
            let formatted;
            if (Number.isInteger(result) && Math.abs(result) < 1e15) {
                formatted = result.toString();
            } else {
                // Use toPrecision for floating point, then clean trailing zeros
                formatted = parseFloat(result.toPrecision(12)).toString();
                if (formatted.length > 16) {
                    formatted = result.toExponential(8);
                }
            }

            return { error: false, value: formatted, numericValue: result };
        } catch (err) {
            return { error: true, message: 'Error' };
        }
    }

    // ===== Nested Parentheses Aware Evaluation =====
    // Enhanced evaluator that handles nested functions like sin(cos(45))
    function deepEvaluate(expr) {
        let e = expr;

        // Replace constants first
        e = e.replace(/π/g, `(${Math.PI})`);
        e = e.replace(/e(?![a-z])/g, `(${Math.E})`);

        // Resolve nested functions from inside out
        const funcPattern = /(sin|cos|tan|ln|log|√|abs)\(/;
        let maxIterations = 50;
        while (funcPattern.test(e) && maxIterations-- > 0) {
            // Find innermost function call
            e = e.replace(/(sin|cos|tan|ln|log|√|abs)\(([^()]+)\)/g, (match, func, inner) => {
                // Evaluate the inner expression first
                let innerExpr = inner;
                innerExpr = innerExpr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
                innerExpr = innerExpr.replace(/(\d+\.?\d*)%/g, '($1/100)');
                innerExpr = innerExpr.replace(/\^/g, '**');
                innerExpr = innerExpr.replace(/(\d+\.?\d*)!/g, (_, n) => factorial(parseFloat(n)));

                let innerVal;
                try {
                    innerVal = new Function(`"use strict"; return (${innerExpr});`)();
                } catch {
                    return 'NaN';
                }

                let result;
                switch (func) {
                    case 'sin':
                        result = state.mode === 'DEG' ? Math.sin(toRadians(innerVal)) : Math.sin(innerVal);
                        break;
                    case 'cos':
                        result = state.mode === 'DEG' ? Math.cos(toRadians(innerVal)) : Math.cos(innerVal);
                        break;
                    case 'tan':
                        result = state.mode === 'DEG' ? Math.tan(toRadians(innerVal)) : Math.tan(innerVal);
                        break;
                    case 'ln':
                        result = Math.log(innerVal);
                        break;
                    case 'log':
                        result = Math.log10(innerVal);
                        break;
                    case '√':
                        result = Math.sqrt(innerVal);
                        break;
                    case 'abs':
                        result = Math.abs(innerVal);
                        break;
                    default:
                        result = NaN;
                }
                return `(${result})`;
            });
        }

        // Now evaluate the remaining expression
        e = e.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
        e = e.replace(/(\d+\.?\d*)%/g, '($1/100)');
        e = e.replace(/(\d+\.?\d*)!/g, (_, n) => factorial(parseFloat(n)));
        e = e.replace(/\^/g, '**');

        // Implicit multiplication
        e = e.replace(/(\d)\(/g, '$1*(');
        e = e.replace(/\)(\d)/g, ')*$1');
        e = e.replace(/\)\(/g, ')*(');

        try {
            const result = new Function(`"use strict"; return (${e});`)();
            if (typeof result !== 'number' || isNaN(result)) {
                return { error: true, message: 'Error' };
            }
            if (!isFinite(result)) {
                return { error: false, value: result > 0 ? 'Infinity' : '-Infinity' };
            }
            let formatted;
            if (Number.isInteger(result) && Math.abs(result) < 1e15) {
                formatted = result.toString();
            } else {
                formatted = parseFloat(result.toPrecision(12)).toString();
                if (formatted.length > 16) {
                    formatted = result.toExponential(8);
                }
            }
            return { error: false, value: formatted, numericValue: result };
        } catch {
            return { error: true, message: 'Error' };
        }
    }

    // ===== Display Update =====
    function updateDisplay() {
        displayCurrent.textContent = state.displayValue;
        displayHistory.textContent = state.history;
        indicatorMode.textContent = state.mode;
        indicatorMemory.textContent = state.hasMemory ? 'M' : '';

        // Adjust font size based on length
        const len = state.displayValue.length;
        displayCurrent.classList.remove('small', 'x-small', 'error-text');
        if (state.error) {
            displayCurrent.classList.add('error-text');
        } else if (len > 16) {
            displayCurrent.classList.add('x-small');
        } else if (len > 10) {
            displayCurrent.classList.add('small');
        }
    }

    function showError(message) {
        state.error = true;
        state.displayValue = message || 'Error';
        state.expression = '';
        displayEl.classList.add('error');
        updateDisplay();
        setTimeout(() => {
            displayEl.classList.remove('error');
        }, 400);
    }

    // ===== Input Handling =====
    function inputDigit(digit) {
        if (state.justEvaluated) {
            state.expression = digit;
            state.displayValue = digit;
            state.history = '';
            state.justEvaluated = false;
            state.error = false;
        } else if (state.error) {
            state.expression = digit;
            state.displayValue = digit;
            state.error = false;
        } else {
            if (state.expression === '0' && digit !== '.') {
                state.expression = digit;
            } else {
                state.expression += digit;
            }
            state.displayValue = state.expression;
        }
        updateDisplay();
    }

    function inputOperator(op) {
        if (state.error) return;

        if (state.justEvaluated) {
            state.expression = state.displayValue + op;
            state.history = '';
            state.justEvaluated = false;
        } else {
            // Replace last operator if there is one
            if (isOperator(lastChar(state.expression))) {
                state.expression = state.expression.slice(0, -1) + op;
            } else if (state.expression === '' || state.expression === '0') {
                // Allow negative numbers
                if (op === '−') {
                    state.expression = '−';
                } else {
                    return;
                }
            } else {
                state.expression += op;
            }
        }
        state.displayValue = state.expression;
        updateDisplay();
    }

    function inputFunction(func) {
        if (state.error) {
            state.expression = '';
            state.error = false;
        }

        const funcStr = func + '(';

        if (state.justEvaluated) {
            // Apply function to the result
            state.expression = funcStr + state.displayValue + ')';
            state.displayValue = state.expression;
            state.history = '';
            state.justEvaluated = false;
        } else {
            state.expression += funcStr;
            state.displayValue = state.expression;
        }
        updateDisplay();
    }

    function inputConstant(constant) {
        if (state.justEvaluated || state.error) {
            state.expression = constant;
            state.history = '';
            state.justEvaluated = false;
            state.error = false;
        } else {
            state.expression += constant;
        }
        state.displayValue = state.expression;
        updateDisplay();
    }

    function inputParen(paren) {
        if (state.error) {
            state.expression = '';
            state.error = false;
        }
        if (state.justEvaluated && paren === '(') {
            state.expression = '(';
            state.history = '';
            state.justEvaluated = false;
        } else {
            state.expression += paren;
        }
        state.displayValue = state.expression;
        updateDisplay();
    }

    function calculate() {
        if (state.error || state.expression === '') return;

        // Auto-close unclosed parentheses
        let expr = state.expression;
        const openCount = (expr.match(/\(/g) || []).length;
        const closeCount = (expr.match(/\)/g) || []).length;
        for (let i = 0; i < openCount - closeCount; i++) {
            expr += ')';
        }

        // Remove trailing operators
        while (isOperator(lastChar(expr))) {
            expr = expr.slice(0, -1);
        }

        if (expr === '') return;

        const result = deepEvaluate(expr);

        if (result.error) {
            state.history = expr + ' =';
            showError(result.message);
        } else {
            state.history = expr + ' =';
            state.displayValue = result.value;
            state.expression = result.value;
            state.justEvaluated = true;
            state.error = false;
            updateDisplay();
        }
    }

    function clearAll() {
        state.expression = '';
        state.displayValue = '0';
        state.history = '';
        state.justEvaluated = false;
        state.error = false;
        updateDisplay();
    }

    function deleteLast() {
        if (state.error || state.justEvaluated) {
            clearAll();
            return;
        }

        // Check if we're deleting a function name like "sin("
        const funcMatch = state.expression.match(/(sin|cos|tan|ln|log|abs|√)\($/);
        if (funcMatch) {
            state.expression = state.expression.slice(0, -(funcMatch[0].length));
        } else {
            state.expression = state.expression.slice(0, -1);
        }

        state.displayValue = state.expression || '0';
        updateDisplay();
    }

    function handleSquare() {
        if (state.error) return;
        if (state.justEvaluated) {
            state.expression = `(${state.displayValue})^2`;
            state.justEvaluated = false;
        } else if (state.expression) {
            state.expression = `(${state.expression})^2`;
        }
        state.displayValue = state.expression;
        updateDisplay();
        calculate();
    }

    function handleInverse() {
        if (state.error) return;
        if (state.justEvaluated) {
            state.expression = `1÷(${state.displayValue})`;
            state.justEvaluated = false;
        } else if (state.expression) {
            state.expression = `1÷(${state.expression})`;
        }
        state.displayValue = state.expression;
        updateDisplay();
        calculate();
    }

    function handlePercent() {
        if (state.error) return;
        if (state.expression) {
            state.expression += '%';
            state.displayValue = state.expression;
            updateDisplay();
        }
    }

    function handleNegate() {
        if (state.error) return;
        if (state.justEvaluated) {
            if (state.displayValue.startsWith('-') || state.displayValue.startsWith('−')) {
                state.displayValue = state.displayValue.substring(1);
            } else {
                state.displayValue = '−' + state.displayValue;
            }
            state.expression = state.displayValue;
            updateDisplay();
            return;
        }

        // Find the last number and negate it
        const match = state.expression.match(/(−?\d+\.?\d*)$/);
        if (match) {
            const num = match[1];
            const prefix = state.expression.slice(0, -num.length);
            if (num.startsWith('−')) {
                state.expression = prefix + num.substring(1);
            } else {
                state.expression = prefix + '−' + num;
            }
            state.displayValue = state.expression;
            updateDisplay();
        }
    }

    function handleFactorial() {
        if (state.error) return;
        if (state.justEvaluated) {
            state.expression = state.displayValue + '!';
            state.justEvaluated = false;
        } else {
            state.expression += '!';
        }
        state.displayValue = state.expression;
        updateDisplay();
    }

    // ===== Memory =====
    function memoryClear() {
        state.memory = 0;
        state.hasMemory = false;
        updateDisplay();
    }

    function memoryRecall() {
        if (state.hasMemory) {
            const val = state.memory.toString();
            if (state.justEvaluated || state.expression === '' || state.expression === '0') {
                state.expression = val;
            } else {
                state.expression += val;
            }
            state.displayValue = state.expression;
            state.justEvaluated = false;
            updateDisplay();
        }
    }

    function memoryAdd() {
        const current = parseFloat(state.displayValue) || 0;
        state.memory += current;
        state.hasMemory = true;
        updateDisplay();
    }

    function memorySubtract() {
        const current = parseFloat(state.displayValue) || 0;
        state.memory -= current;
        state.hasMemory = true;
        updateDisplay();
    }

    // ===== Mode Toggle =====
    function setMode(mode) {
        state.mode = mode;
        degBtn.classList.toggle('active', mode === 'DEG');
        radBtn.classList.toggle('active', mode === 'RAD');
        updateDisplay();
    }

    // ===== Button Click Handler =====
    function handleAction(action) {
        switch (action) {
            // Digits
            case '0': case '1': case '2': case '3': case '4':
            case '5': case '6': case '7': case '8': case '9':
                inputDigit(action);
                break;
            case '.':
                // Prevent multiple dots in a number
                const lastNum = state.expression.split(/[+\−×÷^(]/).pop();
                if (!lastNum.includes('.')) {
                    inputDigit('.');
                }
                break;

            // Operators
            case '+': case '−': case '×': case '÷':
                inputOperator(action);
                break;
            case '^':
                inputOperator('^');
                break;

            // Scientific functions
            case 'sin': case 'cos': case 'tan':
            case 'ln': case 'log': case '√':
                inputFunction(action);
                break;
            case '|x|':
                inputFunction('abs');
                break;

            // Constants
            case 'π': case 'e':
                inputConstant(action);
                break;

            // Parentheses
            case '(': case ')':
                inputParen(action);
                break;

            // Actions
            case 'AC':
                clearAll();
                break;
            case 'DEL':
                deleteLast();
                break;
            case '=':
                calculate();
                break;
            case '%':
                handlePercent();
                break;
            case '±':
                handleNegate();
                break;
            case 'x²':
                handleSquare();
                break;
            case '1/x':
                handleInverse();
                break;
            case '!':
                handleFactorial();
                break;

            // Memory
            case 'mc':
                memoryClear();
                break;
            case 'mr':
                memoryRecall();
                break;
            case 'm+':
                memoryAdd();
                break;
            case 'm-':
                memorySubtract();
                break;
        }
    }

    // ===== Event Listeners =====

    // Button clicks
    document.querySelectorAll('.btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            if (action) handleAction(action);
        });
    });

    // Mode toggle
    degBtn.addEventListener('click', () => setMode('DEG'));
    radBtn.addEventListener('click', () => setMode('RAD'));

    // ===== Keyboard Typing Buffer for Function Names =====
    let keyBuffer = '';
    let keyBufferTimeout = null;

    // Map of typed text → calculator action
    const keywordMap = {
        'sin': 'sin',
        'cos': 'cos',
        'tan': 'tan',
        'log': 'log',
        'ln': 'ln',
        'sqrt': '√',
        'abs': '|x|',
        'pi': 'π',
    };

    // All keywords for prefix matching
    const keywords = Object.keys(keywordMap);

    // Create a floating hint tooltip
    const hintEl = document.createElement('div');
    hintEl.id = 'keyboard-hint';
    hintEl.style.cssText =
        'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);' +
        'background:rgba(60,50,120,0.92);color:#d4c8ff;padding:6px 16px;' +
        'border-radius:8px;font-family:Inter,sans-serif;font-size:13px;' +
        'font-weight:500;letter-spacing:0.5px;opacity:0;transition:opacity 0.2s;' +
        'pointer-events:none;z-index:100;backdrop-filter:blur(8px);' +
        'border:1px solid rgba(140,120,255,0.25);';
    document.body.appendChild(hintEl);

    function showHint(text) {
        hintEl.textContent = text;
        hintEl.style.opacity = '1';
    }

    function hideHint() {
        hintEl.style.opacity = '0';
    }

    function resetBuffer() {
        keyBuffer = '';
        hideHint();
        if (keyBufferTimeout) {
            clearTimeout(keyBufferTimeout);
            keyBufferTimeout = null;
        }
    }

    function checkBuffer() {
        // Exact match — execute the function
        if (keywordMap[keyBuffer]) {
            const action = keywordMap[keyBuffer];
            handleAction(action);
            resetBuffer();
            return;
        }

        // Check if buffer is a prefix of any keyword
        const matches = keywords.filter(kw => kw.startsWith(keyBuffer));
        if (matches.length > 0) {
            // Show hint with matching keywords
            const hints = matches.map(kw => {
                const typed = kw.slice(0, keyBuffer.length);
                const remaining = kw.slice(keyBuffer.length);
                return typed + '‹' + remaining + '›';
            });
            showHint('typing: ' + hints.join('  '));
        } else {
            // No match — flush buffer as individual characters
            // (letters that don't form functions, like 'x' or 'q')
            resetBuffer();
        }
    }

    // Keyboard support
    document.addEventListener('keydown', (e) => {
        const key = e.key;

        // Prevent default for keys we handle
        if (['Enter', 'Backspace', 'Escape', 'Delete'].includes(key) ||
            /^[0-9.+\-*/^()%!]$/.test(key)) {
            e.preventDefault();
        }

        // Check if it's a letter key (for typing function names)
        if (/^[a-zA-Z]$/.test(key)) {
            e.preventDefault();

            // Reset the auto-clear timer
            if (keyBufferTimeout) clearTimeout(keyBufferTimeout);
            keyBufferTimeout = setTimeout(() => {
                resetBuffer();
            }, 1200);

            keyBuffer += key.toLowerCase();
            checkBuffer();
            return;
        }

        // Any non-letter key clears the buffer
        if (keyBuffer) {
            resetBuffer();
        }

        switch (key) {
            case '0': case '1': case '2': case '3': case '4':
            case '5': case '6': case '7': case '8': case '9':
            case '.':
                handleAction(key);
                break;
            case '+':
                handleAction('+');
                break;
            case '-':
                handleAction('−');
                break;
            case '*':
                handleAction('×');
                break;
            case '/':
                handleAction('÷');
                break;
            case '^':
                handleAction('^');
                break;
            case '(':
            case ')':
                handleAction(key);
                break;
            case '%':
                handleAction('%');
                break;
            case '!':
                handleAction('!');
                break;
            case 'Enter':
            case '=':
                handleAction('=');
                break;
            case 'Backspace':
                handleAction('DEL');
                break;
            case 'Escape':
            case 'Delete':
                handleAction('AC');
                break;
        }
    });

    // Initialize display
    updateDisplay();
})();
