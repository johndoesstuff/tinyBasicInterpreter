const fs = require('node:fs');
const readline = require('readline');

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

var lang = {};
var lineDelim = ";"
class Token { //token class
        constructor(type, value) {
                this.type = type;
                this.value = value;
        }
}

fs.readFile(process.argv[2], 'utf8', (err, data) => { //read file
	if (err) {
		console.error(err);
		return;
	}
	lang.eval(data, false); //evaluate file
});
lang.eval = async function(code, debug) { //eval function
	var tokens = lang.tokenize(code, debug);
	if (debug) console.log(tokens);
	
	var ast = lang.parse(tokens, debug);
	if (debug) console.log(JSON.stringify(ast, null, 2));

	var substack = [];
	var variables = {};
	var currentLine = 0;
	
	function getUserInput() {
		return new Promise((resolve, reject) => {
			if (!rl) {
				reject('Readline interface is not initialized.');
				return;
			}
			rl.question('', (input) => {
				if (input === undefined || input === null) {
					reject('Input was undefined or null.');
				} else {
					resolve(input.trim());
				}
			});
		});
	}

	async function evalLine(line) {
		if (line.type != 'line') throw `Expected line got ${line.type}`;
		await evalStatement(line.statement);
	}

	async function evalStatement(statement) {
		if (debug) console.log(`evaluating statement ${statement.type}`);
		if (statement.type == 'if') {
			var left = Number(evalExpression(statement.expressionL));
			var right = Number(evalExpression(statement.expressionR));
			var relop = statement.relop.value;
			var condition = false;
			if (relop == '=') {
				condition = left == right;
			} else if (relop == '<>') {
				condition = left != right;
			} else if (relop == '>') {
				condition = left > right;
			} else if (relop == '<') {
				condition = left < right;
			} else if (relop == '<=') {
				condition = left <= right;
			} else if (relop == '>=') {
				condition = left >= right;
			}
			if (debug) console.log(`if condition determined to be ${condition} (${left} ${relop} ${right})`)
			if (condition) {
				if (debug) console.log(`evaluating substatement`);
				evalStatement(statement.statement);
			}
		} else if (statement.type == 'print') {
			var exprs = statement.exprList.exprs;
			var log = "";
			for (var i = 0; i < exprs.length; i++) {
				var expr = exprs[i];
				if (expr.type == 'STRING') log += expr.value.slice(1, -1); //remove quotes
				else log += String(evalExpression(expr));
			}
			console.log(log);
		} else if (statement.type == 'goto') {
			var target = evalExpression(statement.expression);
			var line = ast.filter(e => e.number && e.number.value == String(target));
			if (line.length != 1) {
				if (line.length == 0) throw `Could not goto line ${target} at ${statement.line}:${statement.col} - no such line exists`;
				else throw `Could not goto line ${target} at ${statement.line}:${statement.col} - found ${line.length} occourances of line`;
			}
			currentLine = ast.indexOf(line[0]) - 1;
			if (debug) console.log(`set currentLine to ${currentLine} : (target ${target})`);
		} else if (statement.type == 'gosub') {
			var target = evalExpression(statement.expression);
			var line = ast.filter(e => e.number && e.number.value == String(target));
			if (line.length != 1) {
				if (line.length == 0) throw `Could not gosub line ${target} at ${statement.line}:${statement.col} - no such line exists`;
				else throw `Could not gosub line ${target} at ${statement.line}:${statement.col} - found ${line.length} occourances of line`;
			}
			substack.push(currentLine);
			currentLine = ast.indexOf(line[0]) - 1;
			if (debug) console.log(`set currentLine to ${currentLine} : (target ${target}) with stack ${substack}`);
		} else if (statement.type == 'input') {
			var varList = statement.varList.vars;
			for (var i = 0; i < varList.length; i++) {
				var variable = varList[i];
				if (debug) console.log(`attempting to await for user input..`);
				const input = await getUserInput();
				if (debug) console.log(`Got user input ${input}`);
				if (isNaN(input)) {
					throw `Invalid input for ${variable.value}. Expected a number.`;
				}
				variables[variable.value] = Number(input);
				if (debug) console.log(`set ${variable.value} to ${Number(input)}`);
			}
		} else if (statement.type == 'let') {
			variables[statement.variable.value] = evalExpression(statement.expression);
			if (debug) console.log(`set ${statement.variable.value} to ${variables[statement.variable.value]}`);
		} else if (statement.type == 'return') {
			if (substack.length == 0) throw `Cannot RETURN to empty substack, instead try using END`;
			currentLine = substack.pop();
			if (debug) console.log(`returned currentLine to ${currentLine} with stack ${substack}`);
		} else if (statement.type == 'end') {
			currentLine = ast.length;
			return;
		}
	}

	function evalExpression(expression) {
		if (expression.type == 'NUMBER') {
			return expression.value;
		} else if (expression.type == 'VARIABLE') {
			if (debug) console.log(`expression: returning variable ${expression.value} with variables of ${JSON.stringify(variables)}`)
			if (debug) console.log(`${variables[expression.value]}`);
			var val = variables[expression.value];
			return val || 0;
		} else if (expression.type == 'binaryExpression') {
			const left = Number(evalExpression(expression.left));
			const right = Number(evalExpression(expression.right));
			const op = expression.operator;
			if (op == '+') {
				return left + right;
			} else if (op == '-') {
				return left - right;
			} else if (op == '*') {
				return left * right;
			} else if (op == '/') {
				return ~~(left / right); //truncate division
			}
		} else if (expression.type == 'group') {
			return evalExpression(expression.expression);
		}
	}

	async function execute() {
		while (currentLine < ast.length) {
			const line = ast[currentLine];
			await evalLine(line);
			currentLine++;
		}
		rl.close();
	}

	execute().catch((error) => {
		console.error('Error during evaluation:', error);
	});
}

lang.parse = function(tokens, debug) { //parser function
	var current = 0;

	tokens = tokens.filter(e => e.type != 'REM');

	for (var i = 0; i < tokens.length; i++) {
		if (tokens[i].type == 'NEWLINE') {
			if (tokens[i+1] && tokens[i+1].type == 'NEWLINE') {
				tokens.splice(i + 1, 1); //remove double newlines
				i--;
			}
		}
	}

	if (debug) console.log("Sanitized tokens:\n", tokens);

	function peek() {
		return tokens[current];
	}

	function consume(type) {
		const token = peek();
		if (token.type == type) {
			current++;
			return token;
		} else {
			throw `Expecting token of type ${type} but found ${token.type}`;
		}
	}

	function parseLine() {
		var number = null;
		if (peek().type == 'NEWLINE') {
			consume('NEWLINE');
			return parseLine();
		}
		if (peek().type == 'NUMBER') {
			number = consume('NUMBER');
		}
		const statement = parseStatement();
		consume('NEWLINE');
		return {
			type: 'line',
			number,
			statement,
		}
	}

	function parseStatement() {
		const token = peek();
		if (token.type != 'KEYWORD') throw `Expecting keyword instead found ${token.type} of value ${token.value}`;
		consume('KEYWORD');
		switch (token.value) {
			case 'PRINT': {
				const exprList = parseExprList();
				return {
					type: 'print',
					exprList,
					line: token.line,
					col: token.col,
				}
			}
			case 'IF': {
				const expressionL = parseExpression();
				const relop = consume('RELOP');
				const expressionR = parseExpression();
				if (peek().value != 'THEN') throw 'Expecting THEN after IF conditional';
				consume('KEYWORD');
				const statement = parseStatement();
				return {
					type: 'if',
					expressionL,
					relop,
					expressionR,
					statement,
					line: token.line,
					col: token.col,
				}
			}
			case 'GOTO': {
				const expression = parseExpression();
				return {
					type: 'goto',
					expression,
					line: token.line,
					col: token.col,
				}
			}
			case 'GOSUB': {
				const expression = parseExpression();
				return {
					type: 'gosub',
					expression,
					line: token.line,
					col: token.col,
				}
			}
			case 'INPUT': {
				const varList = parseVarList();
				return {
					type: 'input',
					varList,
					line: token.line,
					col: token.col,
				}
			}
			case 'LET': {
				const variable = consume('VARIABLE');
				if (peek().value != '=') throw 'Expected = after variable name for LET statement';
				consume('RELOP');
				const expression = parseExpression();
				return {
					type: 'let',
					variable,
					expression,
					line: token.line,
					col: token.col,
				}
			}
			case 'RETURN': {
				return {
					type: 'return',
					line: token.line,
					col: token.col,
				}
			}
			case 'END': {
				return {
					type: 'end',
					line: token.line,
					col: token.col,
				}
			}
			default: {
				throw `${token.value} has not been implemented`;
			}
		}
	}

	function parseExprList() {
		var exprs = [];

		var cont = true;
		while (cont) {
			if (peek().type == 'STRING') {
				exprs.push(consume('STRING'));
			} else {
				exprs.push(parseExpression());
			}
			if (peek().value != ',') cont = false;
			else consume('OPERATOR');
		}
		return {
			type: 'exprList',
			exprs,
		}
	}

	function parseVarList() {
		var vars = [];

		var cont = true;
		while(cont) {
			vars.push(consume('VARIABLE'));
			if (peek().value != ',') cont = false;
			else consume('OPERATOR');
		}
		return {
			type: 'varList',
			vars,
		}
	}

	function parseExpression() {
		var node = parseTerm();
		while (peek() && peek().value == "+" || peek().value == "-") {
			const operator = consume('OPERATOR');
			const right = parseTerm();
			node = { type: 'binaryExpression', operator: operator.value, left: node, right };
		}
		return node;
	}

	function parseTerm() {
		var node = parseFactor();
		while (peek() && peek().value == "*" || peek().value == "/") {
			const operator = consume('OPERATOR');
			const right = parseFactor();
			node = { type: 'binaryExpression', operator: operator.value, left: node, right };
		}
		return node;
	}

	function parseFactor() {
		const token = peek();

		switch (token.type) {
			case 'NUMBER':
				consume('NUMBER');
				return token;
			case 'VARIABLE':
				consume('VARIABLE');
				return token;
			case 'GROUPING':
				if (token.value != '(') throw `Mismatched parentheses [expected ( got ${token.value}] at ${token.line}:${token.col}`;
				consume('GROUPING');
				const expression = parseExpression();
				const closingParen = peek();
				if (closingParen.value != ')') throw `Mismatched parenthesis [expected ) got ${closingParen.value}] at ${closingParen.line}:${closingParen.col}`;
				consume('GROUPING');
				return { type: 'group', expression };
			default:
				throw `Unexpected type for factor, expected NUMBER|VARIABLE|GROUPING got ${token.type} of ${token.value}`;
		}
	}

	var lines = [];
	while (current < tokens.length) {
		lines.push(parseLine());
	}
	return lines;
}

lang.tokenize = function(code, debug) { //tokenize function
        var tokens = [];
        const tokenSpec = [
		{ type: 'NEWLINE', regex: /\n/ },
		{ type: 'KEYWORD', regex: /THEN|END|GOTO|IF|PRINT|RETURN|LET|INPUT|GOSUB/ },
		{ type: 'RELOP', regex: />=|<=|<>|[<>=]/},
		{ type: 'OPERATOR', regex: /[+\-*,\/]/ },
		{ type: 'GROUPING', regex: /[()]/ },
		{ type: 'NUMBER', regex: /[0-9]+/ },
		{ type: 'STRING', regex: /\"[^"]*\"/ },
		{ type: 'REM', regex: /REM.*/ },
		{ type: 'VARIABLE', regex: /[A-Z]/ },
		{ type: 'WHITESPACE', regex: /[ \t]+/ },
        ];
        let pos = 0;
	let line = 0;
	let col = 0;
        while (pos < code.length) {
                let match = null;
                for (let { type, regex } of tokenSpec) {
                        match = regex.exec(code.slice(pos));
                        if (match && match.index === 0) {
                                if (type !== 'WHITESPACE') {
                                        tokens.push({ type, value: match[0], line, col });
                                }
                                pos += match[0].length;
				if (type === 'NEWLINE') {
					col = 0;
					line++;
				} else {
					col += match[0].length;
				}
                                break;
                        }
                }
                //if (debug) console.log(match);

                if (!match || match.index !== 0) {
                        throw new Error(`Unexpected token at position ${pos}: '${code[pos]}'`);
                }
        }
        return tokens;
}
