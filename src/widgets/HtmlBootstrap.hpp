#pragma once
#include <QByteArray>
#include <QMap>
#include <QList>
#include <QSet>
#include <QString>
#include <stdexcept>
namespace tt {
struct HtmlElement {
	QString name;
	QMap<QString, QString> attributes;
	int start = 0, end = 0;
	bool closing = false;
};
// Lexical HTML scanner: preserves bytes/text instead of serializing an XML DOM.
// Comments/declarations and raw text are handled before scanning tags/attributes.
inline QList<HtmlElement> htmlElements(const QString &page)
{
	QList<HtmlElement> out;
	int i = 0;
	while (i < page.size()) {
		if (page[i] != '<') {
			++i;
			continue;
		}
		if (page.mid(i, 4) == "<!--") {
			const auto e = page.indexOf("-->", i + 4);
			out.append(HtmlElement{"#comment", {}, i, int(e < 0 ? page.size() : e + 3), false});
			i = e < 0 ? page.size() : e + 3;
			continue;
		}
		int start = i++;
		if (i >= page.size())
			break;
		if (page[i] == '!' || page[i] == '?') {
			QChar quote;
			while (i < page.size()) {
				auto c = page[i++];
				if (!quote.isNull()) {
					if (c == quote)
						quote = {};
				} else if (c == '\'' || c == '"')
					quote = c;
				else if (c == '>')
					break;
			}
			continue;
		}
		HtmlElement tag;
		tag.start = start;
		if (page[i] == '/') {
			tag.closing = true;
			++i;
		}
		while (i < page.size() && page[i].isSpace())
			++i;
		const auto n = i;
		while (i < page.size() && (page[i].isLetterOrNumber() || page[i] == '-' || page[i] == ':'))
			++i;
		tag.name = page.mid(n, i - n).toLower();
		if (tag.name.isEmpty())
			continue;
		while (i < page.size() && page[i] != '>') {
			if (page[i].isSpace() || page[i] == '/') {
				++i;
				continue;
			}
			const auto a = i;
			while (i < page.size() && !page[i].isSpace() && page[i] != '=' && page[i] != '>')
				++i;
			const auto key = page.mid(a, i - a).toLower();
			while (i < page.size() && page[i].isSpace())
				++i;
			QString value;
			if (i < page.size() && page[i] == '=') {
				++i;
				while (i < page.size() && page[i].isSpace())
					++i;
				if (i < page.size() && (page[i] == '\'' || page[i] == '"')) {
					const auto quote = page[i++];
					const auto v = i;
					while (i < page.size() && page[i] != quote)
						++i;
					value = page.mid(v, i - v);
					if (i < page.size())
						++i;
				} else {
					const auto v = i;
					while (i < page.size() && !page[i].isSpace() && page[i] != '>')
						++i;
					value = page.mid(v, i - v);
				}
			}
			if (!key.isEmpty() && !tag.attributes.contains(key))
				tag.attributes[key] = value;
		}
		if (i < page.size())
			++i;
		tag.end = i;
		out.append(tag);
		if (!tag.closing &&
		    (tag.name == "script" || tag.name == "style" || tag.name == "textarea" || tag.name == "title")) {
			const auto end = page.indexOf("</" + tag.name, i, Qt::CaseInsensitive);
			if (end < 0)
				break;
			i = end;
		}
	}
	return out;
}
inline QString htmlBaseHref(const QString &page)
{
	for (const auto &e : htmlElements(page))
		if (e.name == "base" && !e.closing && e.attributes.contains("href"))
			return e.attributes["href"];
	return {};
}
inline QByteArray injectHtmlBootstrap(const QByteArray &bytes, const QString &bootstrap,
				      bool replaceLegacyConfig = true, const QSet<QString> &approvedScripts = {})
{
	QString page = QString::fromUtf8(bytes);
	if (page.toUtf8() != bytes)
		throw std::invalid_argument("HTML must be UTF-8; author source is unchanged");
	const QString begin = "<!-- tiktok-bootstrap -->", end = "<!-- /tiktok-bootstrap -->";
	const auto existing = htmlElements(page);
	QList<QPair<int, int>> blocks;
	int marker = -1;
	for (const auto &tag : existing) {
		if (tag.name != "#comment")
			continue;
		const auto comment = page.mid(tag.start, tag.end - tag.start);
		if (comment == begin)
			marker = tag.start;
		else if (comment == end && marker >= 0) {
			blocks.append({marker, tag.end - marker});
			marker = -1;
		}
	}
	for (auto it = blocks.crbegin(); it != blocks.crend(); ++it)
		page.remove(it->first, it->second);
	if (replaceLegacyConfig) {
		const auto tags = htmlElements(page);
		for (int i = tags.size() - 1; i >= 0; --i) {
			const auto &t = tags[i];
			const auto src = t.attributes.value("src").section('?', 0, 0).section('#', 0, 0);
			if (t.name == "script" && !t.closing && (src == "config.js" || src.endsWith("/config.js")) &&
			    (approvedScripts.isEmpty() || approvedScripts.contains(src)) && i + 1 < tags.size() &&
			    tags[i + 1].name == "script" && tags[i + 1].closing)
				page.remove(t.start, tags[i + 1].end - t.start);
		}
	}
	const auto tags = htmlElements(page);
	int htmlEnd = -1, headEnd = -1;
	for (const auto &t : tags) {
		if (!t.closing && t.name == "html")
			htmlEnd = t.end;
		if (!t.closing && t.name == "head") {
			headEnd = t.end;
			break;
		}
		if (!t.closing && t.name == "body")
			break;
	}
	bool charset = false;
	for (const auto &tag : tags)
		if (tag.name == "meta" &&
		    (tag.attributes.contains("charset") ||
		     tag.attributes.value("http-equiv").compare("content-type", Qt::CaseInsensitive) == 0))
			charset = true;
	const auto block = begin + (charset ? QString{} : QString("<meta charset=\"utf-8\">")) + bootstrap + end;
	if (headEnd >= 0)
		page.insert(headEnd, block);
	else {
		int prolog = 0;
		while (prolog < page.size()) {
			if (page[prolog].isSpace()) {
				++prolog;
				continue;
			}
			if (page.mid(prolog, 4) == "<!--") {
				const auto e = page.indexOf("-->", prolog + 4);
				if (e < 0)
					break;
				prolog = e + 3;
				continue;
			}
			if (page.mid(prolog, 2) == "<!") {
				const auto e = page.indexOf('>', prolog + 2);
				if (e < 0)
					break;
				prolog = e + 1;
				continue;
			}
			break;
		}
		page.insert(htmlEnd >= 0 ? htmlEnd : prolog, "<head>" + block + "</head>");
	}
	return page.toUtf8();
}
} // namespace tt
