#include "TemplateRegistry.hpp"
#include <QJsonDocument>
#include <QtEndian>
#include <zlib.h>
#include <QSet>
#include <QCryptographicHash>
namespace tt {
namespace {
quint16 u16(const QByteArray &b, int p)
{
	if (p < 0 || qint64(p) + 2 > b.size())
		throw DomainError("INVALID_ARCHIVE", "Truncated ZIP");
	return qFromLittleEndian<quint16>(reinterpret_cast<const uchar *>(b.constData() + p));
}
quint32 u32(const QByteArray &b, int p)
{
	if (p < 0 || qint64(p) + 4 > b.size())
		throw DomainError("INVALID_ARCHIVE", "Truncated ZIP");
	return qFromLittleEndian<quint32>(reinterpret_cast<const uchar *>(b.constData() + p));
}
void put16(QByteArray &b, quint16 n)
{
	char c[2];
	qToLittleEndian(n, reinterpret_cast<uchar *>(c));
	b.append(c, 2);
}
void put32(QByteArray &b, quint32 n)
{
	char c[4];
	qToLittleEndian(n, reinterpret_cast<uchar *>(c));
	b.append(c, 4);
}
} // namespace
void exportZip(const QString &root, const QString &output)
{
	QMap<QString, QByteArray> files;
	QJsonObject checksums;
	for (const auto &f : treeFiles(root)) {
		if (f == "checksums.json")
			continue;
		files[f] = readFile(safePath(root, f));
		checksums[f] = contentHash(root, {f});
	}
	files["checksums.json"] = QJsonDocument(checksums).toJson(QJsonDocument::Compact);
	QByteArray zip, central;
	for (auto it = files.begin(); it != files.end(); ++it) {
		const auto name = it.key().toUtf8(), data = it.value();
		const auto crc = crc32(0, reinterpret_cast<const Bytef *>(data.constData()), data.size());
		const auto offset = zip.size();
		put32(zip, 0x04034b50);
		put16(zip, 20);
		put16(zip, 0x800);
		put16(zip, 0);
		put16(zip, 0);
		put16(zip, 0);
		put32(zip, crc);
		put32(zip, data.size());
		put32(zip, data.size());
		put16(zip, name.size());
		put16(zip, 0);
		zip += name;
		zip += data;
		put32(central, 0x02014b50);
		put16(central, 20);
		put16(central, 20);
		put16(central, 0x800);
		put16(central, 0);
		put16(central, 0);
		put16(central, 0);
		put32(central, crc);
		put32(central, data.size());
		put32(central, data.size());
		put16(central, name.size());
		put16(central, 0);
		put16(central, 0);
		put16(central, 0);
		put16(central, 0);
		put32(central, 0);
		put32(central, offset);
		central += name;
	}
	const auto offset = zip.size();
	zip += central;
	put32(zip, 0x06054b50);
	put16(zip, 0);
	put16(zip, 0);
	put16(zip, files.size());
	put16(zip, files.size());
	put32(zip, central.size());
	put32(zip, offset);
	put16(zip, 0);
	atomicWrite(output, zip);
}
void importZip(const QString &archive, const QString &destination)
{
	const auto zip = readFile(archive, 72 * 1024 * 1024);
	int end = -1;
	for (int p = zip.size() - 22; p >= qMax(0, zip.size() - 65557); --p)
		if (u32(zip, p) == 0x06054b50) {
			end = p;
			break;
		}
	if (end < 0 || u16(zip, end + 4) || u16(zip, end + 6) || u16(zip, end + 8) != u16(zip, end + 10))
		throw DomainError("INVALID_ARCHIVE", "Unsupported ZIP layout");
	int p = u32(zip, end + 16);
	const int count = u16(zip, end + 10);
	if (count > 2049)
		throw DomainError("RESOURCE_LIMIT", "Too many ZIP files");
	QSet<QString> names;
	QMap<QString, QByteArray> extracted;
	qint64 total = 0;
	for (int i = 0; i < count; i++) {
		if (u32(zip, p) != 0x02014b50)
			throw DomainError("INVALID_ARCHIVE", "Missing central directory");
		const auto flags = u16(zip, p + 8), method = u16(zip, p + 10);
		const auto crc = u32(zip, p + 16), compressed = u32(zip, p + 20), size = u32(zip, p + 24),
			   attrs = u32(zip, p + 38);
		const auto nl = u16(zip, p + 28), el = u16(zip, p + 30), cl = u16(zip, p + 32);
		const int offset = u32(zip, p + 42);
		const auto name = QString::fromUtf8(zip.mid(p + 46, nl));
		p += 46 + nl + el + cl;
		if (flags & 1 || (((attrs >> 16) & 0170000) != 0 && ((attrs >> 16) & 0170000) != 0100000) ||
		    name.endsWith('/') || method > 8 || (method != 0 && method != 8))
			throw DomainError("INVALID_ARCHIVE", "Only unencrypted regular ZIP files supported");
		safePath(destination, name);
		if (names.contains(name.toCaseFolded()))
			throw DomainError("INVALID_ARCHIVE", "Duplicate/case-colliding ZIP path");
		names.insert(name.toCaseFolded());
		if (size > 8 * 1024 * 1024 || (total += size) > 64 * 1024 * 1024)
			throw DomainError("RESOURCE_LIMIT", "Archive too large");
		if (u32(zip, offset) != 0x04034b50)
			throw DomainError("INVALID_ARCHIVE", "Bad local ZIP header");
		const int start = offset + 30 + u16(zip, offset + 26) + u16(zip, offset + 28);
		if (start < 0 || qint64(start) + compressed > zip.size())
			throw DomainError("INVALID_ARCHIVE", "ZIP range invalid");
		auto bytes = zip.mid(start, compressed);
		if (method == 8) {
			QByteArray inflated(size, '\0');
			z_stream stream{};
			stream.next_in = reinterpret_cast<Bytef *>(bytes.data());
			stream.avail_in = bytes.size();
			stream.next_out = reinterpret_cast<Bytef *>(inflated.data());
			stream.avail_out = inflated.size();
			if (inflateInit2(&stream, -MAX_WBITS) != Z_OK)
				throw DomainError("INVALID_ARCHIVE", "Deflate initialization failed");
			const auto status = inflate(&stream, Z_FINISH);
			inflateEnd(&stream);
			if (status != Z_STREAM_END || stream.total_out != size)
				throw DomainError("INVALID_ARCHIVE", "Invalid deflate data");
			bytes = inflated;
		}
		if (bytes.size() != size ||
		    crc32(0, reinterpret_cast<const Bytef *>(bytes.constData()), bytes.size()) != crc)
			throw DomainError("CHECKSUM_MISMATCH", "ZIP checksum mismatch");
		extracted[name] = bytes;
	}
	if (!extracted.contains("checksums.json"))
		throw DomainError("CHECKSUM_MISMATCH", "checksums.json required");
	const auto checks = QJsonDocument::fromJson(extracted["checksums.json"]).object();
	if (checks.size() != extracted.size() - 1)
		throw DomainError("CHECKSUM_MISMATCH", "Incomplete checksum list");
	// Validate every SHA before creating any files, including in temporary staging.
	for (auto it = checks.begin(); it != checks.end(); ++it) {
		QCryptographicHash hash(QCryptographicHash::Sha256);
		hash.addData(it.key().toUtf8());
		hash.addData(QByteArray(1, '\0'));
		hash.addData(extracted.value(it.key()));
		if (!extracted.contains(it.key()) ||
		    QString::fromLatin1(hash.result().toHex()) != it.value().toString())
			throw DomainError("CHECKSUM_MISMATCH", "Package content hash mismatch");
	}
	for (auto it = extracted.begin(); it != extracted.end(); ++it)
		atomicWrite(safePath(destination, it.key()), it.value());
}
} // namespace tt
