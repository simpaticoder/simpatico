const xpath = (strExpr, doc=d) => doc.evaluate(strExpr, doc, null, XPathResult.ANY_TYPE, null);

const $ = document.querySelectorAll.bind(document);
