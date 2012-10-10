( function ( $ ) {
	'use strict';

	function IME ( element, options ) {
		this.$element = $( element );
		this.options = $.extend( {}, IME.defaults, options );
		this.active = false;
		this.inputmethod = null;
		this.context = '';
		this.selector = this.$element.imeselector( this );
		this.listen();
	}

	IME.prototype = {
		constructor: IME,

		listen: function () {
			this.$element.on( 'keypress', $.proxy( this.keypress, this ) );
		},

		/**
		 * Transliterate a given string input based on context and input method definition.
		 * If there are no matching rules defined, returns the original string.
		 *
		 * @param input
		 * @param context
		 * @param altGr bool whether altGr key is pressed or not
		 * @returns String transliterated string
		 */
		transliterate: function ( input, context, altGr ) {
			var patterns, regex, rule, replacement,i ;

			if ( altGr ) {
				patterns = this.inputmethod.patterns_x || [];
			} else {
				patterns = this.inputmethod.patterns;
			}

			if ( $.isFunction( patterns ) ) {
				return patterns.call( this, input, context );
			}

			for ( i = 0; i < patterns.length; i++) {
				rule = patterns[i];
				regex = new RegExp( rule[0] + '$' );

				// Last item in the rules. It can be a function too
				// since replace method can have second argument a function
				replacement = rule.slice( -1 )[0];

				// Input string match test
				if ( regex.test( input ) ) {
					// Context test required?
					if ( rule.length === 3 ) {
						if ( new RegExp( rule[1] + '$' ).test( context ) ) {
							return input.replace( regex, replacement );
						}
					} else {
						// No context test required. Just replace.
						return input.replace( regex, replacement );
					}
				}
			}

			// No matches, return the input
			return input;
		},

		keypress: function ( e ) {
			var startPos, c, pos, endPos, divergingPos, input, replacement, altGr;

			altGr = false;

			if ( !this.active ) {
				return true;
			}

			if ( !this.inputmethod ) {
					return true;
			}

			// handle backspace
			if ( e.which === 8 ) {
				// Blank the context
				this.context = '';
				return true;
			}

			// Don't process ASCII control characters (except linefeed),
			// as well as anything involving
			// Alt (except for extended keymaps), Ctrl and Meta
			if ( ( e.which < 32 && e.which !== 13 ) || ( e.altKey && this.inputmethod.patterns_x )
					|| e.ctrlKey || e.metaKey ) {
				// Blank the context
				this.context = '';
				return true;
			}

			if ( e.altKey || e.altGraphKey ){
				altGr = true;
			}

			c = String.fromCharCode( e.which );

			// Get the current caret position. The user may have selected text to overwrite,
			// so get both the start and end position of the selection. If there is no selection,
			// startPos and endPos will be equal.
			pos = getCaretPosition( this.$element );
			startPos = pos[0];
			endPos = pos[1];

			// Get the last few characters before the one the user just typed,
			// to provide context for the transliteration regexes.
			// We need to append c because it hasn't been added to $this.val() yet
			input = lastNChars( this.$element.val() || this.$element.text(), startPos,
					this.inputmethod.maxKeyLength )
					+ c;

			replacement = this.transliterate( input, this.context, altGr );

			// Update the context
			this.context += c;
			if ( this.context.length > this.inputmethod.contextLength ) {
				// The buffer is longer than needed, truncate it at the front
				this.context = this.context.substring( this.context.length
						- this.inputmethod.contextLength );
			}

			// it is a noop
			if ( replacement === input ) {
				return true;
			}

			// Drop a common prefix, if any
			divergingPos = firstDivergence( input, replacement );
			input = input.substring( divergingPos );
			replacement = replacement.substring( divergingPos );
			replaceText( this.$element, replacement, startPos - input.length + 1, endPos );

			e.stopPropagation();
			return false;
		},

		isActive: function () {
			return this.active;
		},

		disable: function () {
			this.active = false;
		},

		enable: function () {
			this.active = true;
		},

		toggle: function () {
			this.active = !this.active;
		},

		setIM: function ( inputmethodId ) {
			this.inputmethod = $.ime.inputmethods[inputmethodId];
		},

		load: function ( name, callback ) {
			var ime = this;
			if ( $.ime.inputmethods[name] ) {
				if ( callback ) {
					callback.call( ime );
				}
				return true;
			}

			$.ajax( {
				url: ime.options.imePath + $.ime.sources[name].source,
				dataType: 'script'
			} ).done( function () {
				debug( name + ' loaded' );
				if ( callback ) {
					callback.call( ime );
				}
			} ).fail( function ( jqxhr, settings, exception ) {
				debug( 'Error in loading inputmethod ' + name + ' Exception: ' + exception );
			} );
		}
	};

	$.fn.ime = function ( option ) {
		return this.each( function () {
			var $this, data, options;

			$this = $( this );
			data = $this.data( 'ime' );
			options = typeof option === 'object' && option;

			if ( !data ) {
				$this.data( 'ime', ( data = new IME( this, options ) ) );
			}

			if ( typeof option === 'string' ) {
				data[option]();
			}

		} );

	};

	$.ime = {};
	$.ime.inputmethods = {};
		$.ime.sources = {};
	$.ime.languages = {};

	var defaultInputMethod = {
		contextLength: 0,
		maxKeyLength: 1
	};

	$.ime.register = function ( inputMethod ) {
		$.ime.inputmethods[inputMethod.id] = $.extend( {}, defaultInputMethod, inputMethod );
	};

	// default options
	IME.defaults = {
		imePath: '../' // Relative/Absolute path for the rules folder of jquery.ime
	};

	// private function for debugging
	function debug ( $obj ) {
		if ( window.console && window.console.log ) {
			window.console.log( $obj );
		}
	}

	/**
	 *
	 */
	function getCaretPosition( $element ) {
		var el, start = 0, end = 0, normalizedValue, range, textInputRange, len, endRange;

		el = $element.get( 0 );

		if ( typeof el.selectionStart === 'number' && typeof el.selectionEnd === 'number' ) {
			start = el.selectionStart;
			end = el.selectionEnd;
		} else {
			// IE
			range = document.selection.createRange();
			if ( range && range.parentElement() === el ) {
				len = el.value.length;
				normalizedValue = el.value.replace( /\r\n/g, '\n' );

				// Create a working TextRange that lives only in the input
				textInputRange = el.createTextRange();
				textInputRange.moveToBookmark( range.getBookmark() );

				// Check if the start and end of the selection are at the very end
				// of the input, since moveStart/moveEnd doesn't return what we want
				// in those cases
				endRange = el.createTextRange();
				endRange.collapse( false );

				if ( textInputRange.compareEndPoints( 'StartToEnd', endRange ) > -1 ) {
					start = end = len;
				} else {
					start = -textInputRange.moveStart( 'character', -len );
					start += normalizedValue.slice( 0, start ).split( '\n' ).length - 1;

					if ( textInputRange.compareEndPoints( 'EndToEnd', endRange ) > -1 ) {
						end = len;
					} else {
						end = -textInputRange.moveEnd( 'character', -len );
						end += normalizedValue.slice( 0, end ).split( '\n' ).length - 1;
					}
				}
			}
		}
		return [ start, end ];

	}

	/**
	 * Helper function to get an IE TextRange object for an element
	 */
	function rangeForElementIE( e ) {
		if ( e.nodeName.toLowerCase() === 'input' ) {
			return e.createTextRange();
		} else {
			var sel = document.body.createTextRange();

			sel.moveToElementText( e );
			return sel;
		}
	}

	/**
	 *
	 */
	function replaceText ( $element, replacement, start, end ) {
		var element = $element.get( 0 ), selection, length, newLines, scrollTop ;

		if ( document.body.createTextRange ) {
			// IE
			selection = rangeForElementIE(element);
			length = element.value.length;
			// IE doesn't count \n when computing the offset, so we won't either
			newLines = element.value.match( /\n/g );

			if ( newLines ) {
				length = length - newLines.length;
			}

			selection.moveStart( 'character', start );
			selection.moveEnd( 'character', end - length );

			selection.text = replacement;
			selection.collapse( false );
			selection.select();
		} else {
			// All other browsers
			scrollTop = element.scrollTop;

			// This could be made better if range selection worked on browsers.
			// But for complex scripts, browsers place cursor in unexpected places
			// and not possible to fix cursor programmatically.
			// Ref Bug https://bugs.webkit.org/show_bug.cgi?id=66630
			element.value = element.value.substring( 0, start ) + replacement
					+ element.value.substring( end, element.value.length );
			// restore scroll
			element.scrollTop = scrollTop;
			// set selection
			element.selectionStart = element.selectionEnd = start + replacement.length;
		}
	}

	/**
	 * Find the point at which a and b diverge, i.e. the first position
	 * at which they don't have matching characters.
	 *
	 * @param a String
	 * @param b String
	 * @return Position at which a and b diverge, or -1 if a === b
	 */
	function firstDivergence ( a, b ) {
		var minLength, i;

		minLength = a.length < b.length ? a.length : b.length;
		for ( i = 0; i < minLength; i++) {
			if ( a.charCodeAt( i ) !== b.charCodeAt( i ) ) {
				return i;
			}
		}
		return -1;
	}

	/**
	 * Get the n characters in str that immediately precede pos
	 * Example: lastNChars( 'foobarbaz', 5, 2 ) === 'ba'
	 *
	 * @param str String to search in
	 * @param pos Position in str
	 * @param n Number of characters to go back from pos
	 * @return Substring of str, at most n characters long, immediately preceding pos
	 */
	function lastNChars ( str, pos, n ) {
		if ( n === 0 ) {
			return '';
		} else if ( pos <= n ) {
			return str.substr( 0, pos );
		} else {
			return str.substr( pos - n, n );
		}
	}

}( jQuery ) );
