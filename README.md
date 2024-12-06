# Tiny BASIC Interpreter

## Written for nodejs, supports:

Commands:
- PRINT
- IF
- GOTO
- INPUT
- LET
- GOSUB
- RETURN
- END

Other Features:
- Nested expression parsing
- REM comments
- Integer division

As an implementation detail all uninitialized variables are set to a value of 0 for backwards compatibility

## To run:

```
node bas.js [TB FILENAME]
```

Examples can be found in `/examples`
