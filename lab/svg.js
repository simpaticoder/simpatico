const xpath = (strExpr, doc=d) => doc.evaluate(strExpr, doc, null, XPathResult.ANY_TYPE, null);

const $ = document.querySelectorAll.bind(document);
const elt = (idOrClass, parent) => {
    if (parent){
        return parent.getElementsByClassName(idOrClass)[0];
    } else {
        return document.getElementById(idOrClass);
    }

}