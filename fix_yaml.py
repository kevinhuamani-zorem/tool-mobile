import os
import yaml

# Define the base path for YAML files
yaml_base_path = os.path.join(os.getcwd(), 'resources', 'data')

# Define the standard structure for YAML files
standard_structure = {
    'name': '',
    'description': '',
    'personality': 'real_email',
    'data_in_bcp': 'true',
    'card_usage': 'bcp_card',
    'idc': '',
    'cod_internacional': '+51',
    'phone_number': '',
    'uuid': '',
    'platform': 'android',
    'version': '8.0',
    'device_token': '',
    'device_type': 'PERSONAL',
    'phone_model': 'Samsung Note 4 6.0 MARSHMALLOW',
    'phone_manufacturer': 'Samsung',
    'email': '',
    'password': '999999',
    'cards': [
        {
            'number': '',
            'pin4': '',
            'expiry_date': '',
            'status': '00',
            'cvv': '',
            'usage': 'token',
            'visa_card_token': '',
            'accounts': [
                {
                    'number': '',
                    'currency': 'soles',
                    'balance': '',
                    'type': 'CUENTAS DE AHORROS',
                    'subtype': 'PRIMERA CUENTA',
                    'release_date': 'new',
                    'status': 'active'
                }
            ]
        }
    ]
}

def adjust_yaml(file_path):
    """Adjust a YAML file to match the standard structure."""
    with open(file_path, 'r') as file:
        data = yaml.safe_load(file)

    # Merge the standard structure with the existing data
    adjusted_data = {**standard_structure, **data}

    # Write the adjusted data back to the file
    with open(file_path, 'w') as file:
        yaml.dump(adjusted_data, file, default_flow_style=False, sort_keys=False)

def process_yaml_files():
    """Process all YAML files in the specified directory."""
    for root, _, files in os.walk(yaml_base_path):
        for file in files:
            if file.endswith('.yml'):
                file_path = os.path.join(root, file)
                print(f"Adjusting {file_path}...")
                adjust_yaml(file_path)

if __name__ == '__main__':
    process_yaml_files()
