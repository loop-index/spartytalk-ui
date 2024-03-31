// Socket connection
const base_url = "http://localhost:5000";
var connected = false;
const base_program = `gogreen
    nvar count = 10;
    while count > 0 gogreen
        spartysays count;
        count = count - 1;
    gowhite;
gowhite;
`

$(document).ready(function() {
    // Initialize text editor
    $("#line-text").text(base_program);
    updateLineNumber($("#line-text"));

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
        syntaxHighlight($("#line-text"), base_program, 0);
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
                $("#zsh-prompt").before(`<span>${data["output"]["message"]}</span><br>`);
            }

            $("#output").scrollTop($("#output")[0].scrollHeight);
        }
    });

    // Handler for receiving end of output from server
    socket.on("output-end", function(data) {
        console.log("Received end of output");

        if (data["message"] != "End of output") {
            $("#zsh-prompt").before(`<span class="text-danger">${data["message"]}</span><br>`);
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

    // Initialize tooltips
    const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
    const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));
});

// Sidebar
$("#sidebar-toggle").click(function() {
    $("#sidebar-container").toggleClass("slide-in").toggleClass("slide-out");
});

// Text editor
$("#line-text").on("input", async function(e) {
    // Update line number
    updateLineNumber($(this));

    if (!connected) {
        return;
    }

    // Get current caret position
    let caret_pos = await getCaretPosition($(this)[0]);
    // console.log(caret_pos);

    // Get token analysis
    await syntaxHighlight($(this), $(this).text, caret_pos);
});

// Tab key
$("#line-text").keydown(async function(e) {
    if (e.keyCode == 9) {
        e.preventDefault();
        let text = $(this).text();
        let caret_pos = await getCaretPosition($(this)[0]);

        // Insert tab
        let text_before = text.substring(0, caret_pos);
        let text_after = text.substring(caret_pos);
        let new_text = text_before + "    " + text_after;

        // Get token analysis
        await syntaxHighlight($(this), new_text, caret_pos + 4);
    }
});

// Clear terminal
$("#clear-terminal").click(function() {
    $("#zsh-prompt").siblings().remove();
});

// Syntax highlight
async function syntaxHighlight(elem, text, caret_pos=0) {
    await fetch("http://127.0.0.1:5000/parse", {
        method: "POST",
        body: JSON.stringify({text: text}),
        headers: {
            "Content-Type": "application/json"
        }
    }).then(response => response.text()).then(async data => {
        // console.log(data);
        await $(elem).html(data);

        // Restore caret position
        setCaretPosition($(elem)[0], caret_pos);
    });
}

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
        temp.parentNode.removeChild(temp); 
        return caretposition; 
   }
}

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