#include "WidgetEditor.hpp"
#include <QFormLayout>
#include <QLineEdit>
#include <QSpinBox>
#include <QPlainTextEdit>
#include <QCheckBox>
#include <QDialogButtonBox>
#include <QJsonArray>
namespace tt {
bool WidgetEditor::edit(WidgetConfig &w, QWidget *parent)
{
	QDialog d(parent);
	d.setWindowTitle(QObject::tr("Configure widget"));
	auto *layout = new QFormLayout(&d);
	QMap<QString, QLineEdit *> strings;
	for (auto key : {"name", "theme", "color", "soundUrl", "customHtml"}) {
		auto *e = new QLineEdit(w.value[key].toString());
		strings[key] = e;
		layout->addRow(QObject::tr(key), e);
	}
	QMap<QString, QSpinBox *> numbers;
	for (auto key : {"width", "height", "messageLimit", "likeAggregationMs", "viewerCoalescingMs"}) {
		auto *e = new QSpinBox;
		e->setRange(1, 8192);
		e->setValue(w.value[key].toInt(30));
		numbers[key] = e;
		layout->addRow(QObject::tr(key), e);
	}
	auto *css = new QPlainTextEdit(w.value["customCss"].toString());
	layout->addRow(QObject::tr("Custom CSS"), css);
	auto *filters = new QLineEdit;
	QStringList types;
	for (auto v : w.value["filters"].toArray())
		types << v.toString();
	filters->setText(types.join(','));
	layout->addRow(QObject::tr("Event filters (comma separated; empty = all)"), filters);
	QCheckBox animation(QObject::tr("Animation")), sound(QObject::tr("Sound"));
	animation.setChecked(w.value["animation"].toBool());
	sound.setChecked(w.value["sound"].toBool());
	layout->addRow(&animation);
	layout->addRow(&sound);
	QDialogButtonBox buttons(QDialogButtonBox::Ok | QDialogButtonBox::Cancel);
	layout->addRow(&buttons);
	QObject::connect(&buttons, &QDialogButtonBox::accepted, &d, &QDialog::accept);
	QObject::connect(&buttons, &QDialogButtonBox::rejected, &d, &QDialog::reject);
	if (d.exec() != QDialog::Accepted)
		return false;
	for (auto it = strings.begin(); it != strings.end(); ++it)
		w.value[it.key()] = it.value()->text();
	for (auto it = numbers.begin(); it != numbers.end(); ++it)
		w.value[it.key()] = it.value()->value();
	w.value["customCss"] = css->toPlainText();
	QJsonArray array;
	for (auto type : filters->text().split(',', Qt::SkipEmptyParts))
		array.push_back(type.trimmed());
	w.value["filters"] = array;
	w.value["animation"] = animation.isChecked();
	w.value["sound"] = sound.isChecked();
	return true;
}
} // namespace tt
