// Socket connection
const base_url = "/";
var connected = false;
const base_program = `// Program must be enclosed in gogreen and gowhite (or curly braces)
gogreen
    // Obligatory hello world function
    function hello_world() gogreen
        spartysays "Hello, World!\\n";
    gowhite;

    // Function to draw a tree
    // width: width of the tree
    function tree(width) gogreen
        nvar level = 0;
        nvar spacing = 0;
        nvar _space = 0;
        
        // Loop through each level of the tree
        while level < width gogreen
            spacing = (width - 2 - level) / 2;
            _space = spacing;
            
            // Draw whitespace before tree
            while _space > 0 gogreen
                spartysays " ";
                _space = _space - 1;
            gowhite;
            
            spartysays "/";

            // Draw whitespace inside tree
            _space = level;
            while _space > 0 gogreen
                if level == width - 2 gogreen
                    spartysays "_";
                gowhite; else gogreen
                    spartysays " ";
                gowhite;
                _space = _space - 1;
            gowhite;
            
            spartysays "\\";

            // Draw whitespace after tree
            _space = spacing;
            while _space > 0 gogreen
                spartysays " ";
                _space = _space - 1;
            gowhite;
            
            level = level + 2;
            spartysays "\\n";
        gowhite;
        
        // Draw trunk
        spacing = (width - 2) / 2;
        _space = spacing;
        while _space > 0 gogreen
            spartysays " ";
            _space = _space - 1;
        gowhite;
        spartysays "||";
        _space = spacing;
        while _space > 0 gogreen
            spartysays " ";
            _space = _space - 1;
        gowhite;
    gowhite;

    call hello_world();
    call tree(10);
gowhite;
`
var timeoutID = null;
const syntaxHighlightDelay = 200;

$(document).ready(function() {
    // Initialize socket connection
    let socket = io.connect(base_url);
    let sending = false;
    let halting = false;

    // Handler for handshake
    socket.on("connect", function() {
        console.log("Socket connected");
        connected = true;

        $("#server-disconnected").addClass("d-none");
        $("#server-connected").removeClass("d-none");
        socket.emit("parse", {code: base_program, caret_pos: 0})
    });

    socket.on("after_connect", function(data) {
        // console.log("Client ID: " + data["data"]);
    });

    // Handler for disconnect
    socket.on("disconnect", function() {
        console.log("Socket disconnected");
        connected = false;

        $("#server-connected").addClass("d-none");
        $("#server-disconnected").removeClass("d-none");

        $("#run-code").removeClass("fa-spinner fa-spin d-none").addClass("fa-play");
        $("#stop-code").removeClass("fa-spinner fa-spin").addClass("fa-stop d-none");
    });

    // Handler for receiving output from server
    socket.on("output", function(data) {
        if (halting) {
            return;
        }
        if (sending) {
            sending = false;
            $("#run-code").removeClass("fa-spinner fa-spin").addClass("fa-play d-none");
            $("#stop-code").removeClass("d-none");
        }
        // console.log(data);

        // Output
        if (data["output"]){
            if (data["output"]["type"] != "ConsoleOutput") {
                $("#zsh-prompt").before(`<span class="text-danger">${data["output"]["message"]}</span><br>`);
                $("#run-code").removeClass("d-none");
            } else {
                let text = data["output"]["message"].replace("\\n", "<br>").replace(" ", "&nbsp;");
                $("#zsh-prompt").before(`<span>${text}</span>`);
            }

            $("#output").scrollTop($("#output")[0].scrollHeight);
        }
    });

    // Handler for receiving end of output from server
    socket.on("output-end", function(data) {
        console.log("Received end of output");

        if (data["message"] != "End of output") {
            $("#zsh-prompt").before(`<br><span class="text-danger">${data["message"]}</span><br>`);
        }

        // Execution duration
        let duration = data["duration"];
        $("#duration").removeClass("d-none");
        $("#duration-text").text((duration * 1000).toFixed(2) + "μs");

        if (sending) {
            sending = false;
            $("#run-code").removeClass("fa-spinner fa-spin").addClass("fa-play");
        } else {
            $("#run-code").removeClass("d-none");
            $("#stop-code").removeClass("fa-spinner fa-spin").addClass("fa-stop d-none");
        }

        if (halting) {
            halting = false;
        }
    });

    socket.on("highlight", function(data) {
        let text = data["text"];

        // Check if the text content is the same, if not text has been updated and we should wait for the next highlight call
        if ($("#line-text").text() != text) {
            return;
        }

        let caret_pos = data["caret_pos"];
        let code = data["html"];
        $("#line-text").html(code);
        setCaretPosition($("#line-text")[0], caret_pos);
    });

    // Initialize tooltips
    const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
    const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));

    // Sidebar
    $("#sidebar-toggle").click(function() {
        $("#sidebar-container").toggleClass("slide-in").toggleClass("slide-out");
    });

    // Handler for sending code to server
    $("#run-code").click(function() {
        if (!connected) {
            return;
        }

        // Send code to server
        if (sending) {
            sending = false;
            $(this).removeClass("fa-spinner fa-spin").addClass("fa-play");
        } else {
            sending = true;
            $(this).removeClass("fa-play").addClass("fa-spinner fa-spin");
            $("#zsh-prompt").before(`
                <br>
                <span class="text-success">
                    <i class="fa-solid fa-angle-right"></i>
                    gogreen!
                </span>
            <br>`);

            let code = $("#line-text").text();
            socket.emit("run", {code: code});
        }
    });

    // Handler for stopping code execution
    $("#stop-code").click(function() {
        if (!connected) {
            return;
        }

        if (!halting) {
            socket.emit("halt", {message: "Stop execution"});
            halting = true;
            console.log("Program halted");

            $(this).removeClass("fa-stop").addClass("fa-spinner fa-spin");
        }
    });

    // Initialize text editor
    $("#line-text").text(base_program);
    updateLineNumber($("#line-text"));

    // Text editor
    $("#line-text").on("input", async function(e) {
        // Clear timeout
        clearTimeout(timeoutID);

        // Update line number
        updateLineNumber($(this));

        if (!connected) {
            return;
        }

        // Get current caret position
        let caret_data = await getCaretPosition($(this)[0]);
        let caret_pos = caret_data.raw;

        // Syntax highlight after a delay to prevent multiple requests
        let that = this;
        timeoutID = setTimeout(async function() {
            let text = $(that).text();
            socket.emit("parse", {code: text, caret_pos: caret_pos});
        }, syntaxHighlightDelay);
    });

    // Special keys
    $("#line-text").keydown(async function(e) {

        // Tab
        if (e.keyCode == 9) {
            // Prevent default tab action
            e.preventDefault();

            // Clear timeout
            clearTimeout(timeoutID);

            // If user is not selecting text, insert tab at caret
            let selection = window.getSelection();
            if (selection.type != "Range") {

                // Get current caret position
                let text = $(this).text();
                let caret_data = await getCaretPosition($(this)[0]);
                let caret_pos = caret_data.raw;

                // Insert tab
                await insertAtCaret($(this)[0], "    ");
                let new_text = $(this).text();

                // Syntax highlight after a delay to prevent multiple requests
                timeoutID = setTimeout(async function() {
                    socket.emit("parse", {code: new_text, caret_pos: caret_pos + 4});
                }, syntaxHighlightDelay);
            }
        }

        // Enter
        else if (e.keyCode == 13) {
            e.preventDefault();

            // Clear timeout
            clearTimeout(timeoutID);

            // Get current line
            let text = $(this).text();
            let caret_data = await getCaretPosition($(this)[0]);
            let caret_pos = caret_data.raw;
            let line_no = caret_data.line;
            let line_text = text.split("\n")[line_no - 1];

            // Get indentation
            let indentation = line_text.match(/^\s*/)[0];

            // Insert newline with indentation
            await insertAtCaret($(this)[0], "\n" + indentation);
            updateLineNumber($(this));
            let new_text = $(this).text();

            // Prompt caret position
            getCaretPosition($(this)[0]);

            // Syntax highlight after a delay to prevent multiple requests
            timeoutID = setTimeout(async function() {
                socket.emit("parse", {code: new_text, caret_pos: caret_pos + indentation.length + 1});
            }, syntaxHighlightDelay);
        }
    });

    // Click on text editor
    $("#line-text").click(async function(e) {
        // Prompt caret position
        getCaretPosition($(this)[0]);
    });

    // Clear terminal
    $("#clear-terminal").click(function() {
        $("#zsh-prompt").siblings().remove();
    });
});

// Update line number
function updateLineNumber(elem) {
    let elem_height = $(elem).height();
    let line_height = $(elem).css("line-height");
    let line_count = Math.max(1, Math.floor(elem_height / parseInt(line_height)));

    // Update line numbers
    let line_numbers = "";
    for (let i = 1; i <= line_count; i++) {
        line_numbers += i + "<br>";
    }
    $("#line-number").html(line_numbers);
}

// Get caret position
async function getCaretPosition(target) {
    if (target.isContentEditable || document.designMode === "on") {
        target.focus();
        const _range = document.getSelection().getRangeAt(0);
        if (!_range.collapsed) {
            return null;
        }
        const range = _range.cloneRange();
        const temp = document.createTextNode("\0");
        range.insertNode(temp);
        const caretposition = target.innerText.indexOf("\0");
        const lines = target.innerText.substring(0, caretposition).split("\n");
        const line_no = lines.length;
        const col_no = lines[lines.length - 1].length;
        temp.parentNode.removeChild(temp);

        // Update line numbers
        $("#editor-info").text(`line: ${line_no} column: ${col_no + 1}`);
        return {raw: caretposition, line: line_no, col: col_no};
    }
}

// Insert at caret position
async function insertAtCaret(target, content) {
    if (target.isContentEditable || document.designMode === "on") {
        target.focus();
        const _range = document.getSelection().getRangeAt(0);
        if (!_range.collapsed) {
            return null;
        }

        const temp = document.createTextNode(content);
        _range.insertNode(temp);
        _range.setStartAfter(temp);
        _range.setEndAfter(temp);
        document.getSelection().removeAllRanges();
        document.getSelection().addRange(_range);

        return true;
    }
}

// Set caret position
function setCaretPosition(target, offset) {
    if (target.isContentEditable || document.designMode === "on") {
        var range = document.createRange();
        var sel = window.getSelection();
        var currentNode = target;
        var found = false;

        function traverseNodes(node) {
            if (node.nodeType == 3) { // Text node
                if (offset <= node.length) {
                    range.setStart(node, offset);
                    range.collapse(true);
                    found = true;
                } else {
                    offset -= node.length;
                }
            } else if (node.nodeType == 1) { // Element node
                for (var i = 0; i < node.childNodes.length; i++) {
                    traverseNodes(node.childNodes[i]);
                    if (found) return;
                }
            }
        }

        traverseNodes(target);

        if (!found) {
            range.setStart(currentNode, currentNode.childNodes.length);
            range.collapse(true);
        }

        sel.removeAllRanges();
        sel.addRange(range);
    }
}