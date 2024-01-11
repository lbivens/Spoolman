import React from "react";
import { IResourceComponentsProps, useTranslate } from "@refinedev/core";
import { Create, useForm, useSelect } from "@refinedev/antd";
import { Form, Input, Select, InputNumber, ColorPicker, Button } from "antd";
import TextArea from "antd/es/input/TextArea";
import { numberFormatter, numberParser } from "../../utils/parsing";
import { IVendor } from "../vendors/model";
import { IResin } from "./model";

interface CreateOrCloneProps {
  mode: "create" | "clone";
}

export const ResinCreate: React.FC<IResourceComponentsProps & CreateOrCloneProps> = (props) => {
  const t = useTranslate();

  const { form, formProps, formLoading, onFinish, redirect } = useForm<IResin>();

  if (props.mode === "clone" && formProps.initialValues) {
    // Fix the vendor_id
    if (formProps.initialValues.vendor) {
      formProps.initialValues.vendor_id = formProps.initialValues.vendor.id;
    }
  }

  const handleSubmit = async (redirectTo: "list" | "edit" | "create") => {
    const values = await form.validateFields();
    await onFinish(values);
    redirect(redirectTo, (values as IResin).id);
  };

  const { selectProps } = useSelect<IVendor>({
    resource: "vendor",
    optionLabel: "name",
  });

  return (
    <Create
      title={props.mode === "create" ? t("resin.titles.create") : t("resin.titles.clone")}
      isLoading={formLoading}
      footerButtons={() => (
        <>
          <Button type="primary" onClick={() => handleSubmit("list")}>
            {t("buttons.save")}
          </Button>
          <Button type="primary" onClick={() => handleSubmit("create")}>
            {t("buttons.saveAndAdd")}
          </Button>
        </>
      )}
    >
      <Form {...formProps} layout="vertical">
        <Form.Item
          label={t("resin.fields.name")}
          help={t("resin.fields_help.name")}
          name={["name"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <Input maxLength={64} />
        </Form.Item>
        <Form.Item
          label={t("resin.fields.vendor")}
          name={["vendor_id"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <Select
            {...selectProps}
            allowClear
            filterSort={(a, b) => {
              return a?.label && b?.label
                ? (a.label as string).localeCompare(b.label as string, undefined, { sensitivity: "base" })
                : 0;
            }}
            filterOption={(input, option) =>
              typeof option?.label === "string" && option?.label.toLowerCase().includes(input.toLowerCase())
            }
          />
        </Form.Item>
        <Form.Item
          label={t("resin.fields.color_hex")}
          name={["color_hex"]}
          rules={[
            {
              required: false,
            },
          ]}
          getValueFromEvent={(e) => {
            return e?.toHex();
          }}
        >
          <ColorPicker format="hex" />
        </Form.Item>
        <Form.Item
          label={t("resin.fields.material")}
          help={t("resin.fields_help.material")}
          name={["material"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <Input maxLength={64} />
        </Form.Item>
        <Form.Item
          label={t("resin.fields.price")}
          help={t("resin.fields_help.price")}
          name={["price"]}
          rules={[
            {
              required: false,
              type: "number",
              min: 0,
            },
          ]}
        >
          <InputNumber precision={2} formatter={numberFormatter} parser={numberParser} />
        </Form.Item>
        <Form.Item
          label={t("resin.fields.density")}
          name={["density"]}
          rules={[
            {
              required: true,
              type: "number",
              min: 0,
              max: 100,
            },
          ]}
        >
          <InputNumber addonAfter="g/cm³" precision={2} formatter={numberFormatter} parser={numberParser} />
        </Form.Item>
        <Form.Item
          label={t("resin.fields.diameter")}
          name={["diameter"]}
          rules={[
            {
              required: true,
              type: "number",
              min: 0,
              max: 10,
            },
          ]}
        >
          <InputNumber addonAfter="mm" precision={2} formatter={numberFormatter} parser={numberParser} />
        </Form.Item>
        <Form.Item
          label={t("resin.fields.weight")}
          help={t("resin.fields_help.weight")}
          name={["weight"]}
          rules={[
            {
              required: false,
              type: "number",
              min: 0,
            },
          ]}
        >
          <InputNumber addonAfter="g" precision={1} />
        </Form.Item>
        <Form.Item
          label={t("resin.fields.bottle_weight")}
          help={t("resin.fields_help.bottle_weight")}
          name={["bottle_weight"]}
          rules={[
            {
              required: false,
              type: "number",
              min: 0,
            },
          ]}
        >
          <InputNumber addonAfter="g" precision={1} />
        </Form.Item>
        <Form.Item
          label={t("resin.fields.settings_cure_temp")}
          name={["settings_cure_temp"]}
          rules={[
            {
              required: false,
              type: "number",
              min: 0,
            },
          ]}
        >
          <InputNumber addonAfter="°C" precision={0} />
        </Form.Item>
        <Form.Item
          label={t("resin.fields.settings_cure_time")}
          name={["settings_cure_time"]}
          rules={[
            {
              required: false,
              type: "number",
              min: 0,
            },
          ]}
        >
          <InputNumber addonAfter="s" precision={0} />
        </Form.Item>
        <Form.Item
          label={t("resin.fields.settings_wash_time")}
          name={["settings_wash_time"]}
          rules={[
            {
              required: false,
              type: "number",
              min: 0,
            },
          ]}
        >
          <InputNumber addonAfter="s" precision={0} />
        </Form.Item>
        <Form.Item
          label={t("resin.fields.article_number")}
          help={t("resin.fields_help.article_number")}
          name={["article_number"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <Input maxLength={64} />
        </Form.Item>
        <Form.Item
          label={t("resin.fields.comment")}
          name={["comment"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <TextArea maxLength={1024} />
        </Form.Item>
      </Form>
    </Create>
  );
};

export default ResinCreate;
