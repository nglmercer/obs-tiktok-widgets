#pragma once
#include <QString>
#include <QRegularExpression>
namespace tt {
inline QRegularExpression htmlTokens()
{
	return QRegularExpression(
		QStringLiteral(
			R"html(<!--[\s\S]*?-->|<(script|style)\b(?:"[^"]*"|'[^']*'|[^'">])*>[\s\S]*?</\1\s*>|<![^>]*>|<(?:"[^"]*"|'[^']*'|[^'">])+>)html"),
		QRegularExpression::CaseInsensitiveOption);
}
inline QString htmlBaseHref(const QString &page)
{
	auto matches = htmlTokens().globalMatch(page);
	const QRegularExpression base(R"html(^<base\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))html",
				      QRegularExpression::CaseInsensitiveOption);
	while (matches.hasNext()) {
		const auto match = base.match(matches.next().captured());
		if (match.hasMatch())
			return !match.captured(1).isNull()   ? match.captured(1)
			       : !match.captured(2).isNull() ? match.captured(2)
							     : match.captured(3);
	}
	return {};
}
// Tokenize comments and raw-text elements as units so apparent tags in scripts
// cannot be mistaken for document structure. Only generated copies are changed.
inline QByteArray injectHtmlBootstrap(const QByteArray &bytes, const QString &bootstrap)
{
	QString page = QString::fromUtf8(bytes);
	const auto tokens = htmlTokens();
	// Generated blocks have explicit boundaries for idempotent reinjection.
	page.remove(QRegularExpression("<!-- tiktok-bootstrap -->[\\s\\S]*?<!-- /tiktok-bootstrap -->"));
	auto scripts = tokens.globalMatch(page);
	QList<QPair<int, int>> remove;
	const QRegularExpression configScript(
		"^<script\\b[^>]*\\bsrc\\s*=\\s*(?:[\"'](?:[^\"']*/)?config\\.js(?:[?#][^\"']*)?[\"']|config\\.js(?=[\\s>]))[^>]*>\\s*</script\\s*>$",
		QRegularExpression::CaseInsensitiveOption);
	while (scripts.hasNext()) {
		const auto token = scripts.next();
		if (configScript.match(token.captured()).hasMatch())
			remove.prepend({token.capturedStart(), token.capturedLength()});
	}
	for (const auto &span : remove)
		page.remove(span.first, span.second);
	const auto block = "<!-- tiktok-bootstrap -->" + bootstrap + "<!-- /tiktok-bootstrap -->";
	auto matches = tokens.globalMatch(page);
	int htmlEnd = -1, prefixEnd = 0, previousEnd = 0;
	bool prefixOnly = true;
	while (matches.hasNext()) {
		const auto token = matches.next();
		const auto tag = token.captured();
		if (!page.mid(previousEnd, token.capturedStart() - previousEnd).trimmed().isEmpty())
			prefixOnly = false;
		previousEnd = token.capturedEnd();
		if (tag.startsWith("<!--") || tag.startsWith("<!")) {
			if (prefixOnly)
				prefixEnd = token.capturedEnd();
			continue;
		}
		prefixOnly = false;
		if (QRegularExpression("^<html\\b", QRegularExpression::CaseInsensitiveOption).match(tag).hasMatch())
			htmlEnd = token.capturedEnd();
		if (QRegularExpression("^<head\\b", QRegularExpression::CaseInsensitiveOption).match(tag).hasMatch()) {
			page.insert(token.capturedEnd(), block);
			return page.toUtf8();
		}
		if (QRegularExpression("^<body\\b", QRegularExpression::CaseInsensitiveOption).match(tag).hasMatch())
			break;
	}
	page.insert(htmlEnd >= 0 ? htmlEnd : prefixEnd, "<head>" + block + "</head>");
	return page.toUtf8();
}
} // namespace tt
