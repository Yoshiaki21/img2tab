// Copyright 2011 Sumeet Patel. All rights reserved
// Determine if element value is in array
function inArray (elem, array) {
	if (array.indexOf) {
		return array.indexOf(elem);
	}

	for (var i=0, length = array.length; i < length; i++ ) {
		if (array[i] === elem) {
			return i;
		}
	}
	return -1;
}